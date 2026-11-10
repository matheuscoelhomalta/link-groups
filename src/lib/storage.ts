import { environment, LocalStorage, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser, LinkDB, LinkGroup, LinkItem } from "./types";
import { BROWSER_OPTIONS } from "./types";
import { reconcileOfflineDB } from "./data-transfer";
import {
  readSyncConfig,
  requestSync,
  type SyncConfig,
  type SyncState,
  type SyncReconciliation,
} from "./sync";

const STORAGE_KEY = "link-groups-db";
const BACKUP_STORAGE_KEY = "link-groups-db-backup";

const CURRENT_DB_VERSION = 1;
const DEFAULT_DB: LinkDB = { version: CURRENT_DB_VERSION, groups: [] };
const DEFAULT_DB_RAW = JSON.stringify(DEFAULT_DB);

const VALID_BROWSERS = new Set(BROWSER_OPTIONS.map((option) => option.value));

let liveDb: LinkDB = DEFAULT_DB;
const dbListeners = new Set<(db: LinkDB) => void>();

function setLiveDb(next: LinkDB) {
  // Every refresh parses a fresh object; notifying on identical content would
  // re-render every open view on each poll.
  if (liveDb === next || JSON.stringify(liveDb) === JSON.stringify(next))
    return;
  liveDb = next;
  for (const listener of dbListeners) {
    listener(next);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBrowser(value: unknown): Browser {
  if (typeof value !== "string") return "";
  return VALID_BROWSERS.has(value as Browser) ? (value as Browser) : "";
}

function normalizeLink(value: unknown): LinkItem | null {
  if (!isRecord(value)) return null;
  const id = asNonEmptyString(value.id);
  const title = asNonEmptyString(value.title);
  const url = asNonEmptyString(value.url);
  if (!id || !title || !url) return null;
  return { id, title, url };
}

function normalizeGroup(value: unknown): LinkGroup | null {
  if (!isRecord(value)) return null;
  const id = asNonEmptyString(value.id);
  const title = asNonEmptyString(value.title);
  if (!id || !title) return null;

  const links = Array.isArray(value.links)
    ? value.links.map(normalizeLink).filter(Boolean)
    : [];

  return {
    id,
    title,
    links: links as LinkItem[],
    browser: normalizeBrowser(value.browser),
  };
}

type ParseResult = { db: LinkDB; isValid: boolean; hadValue: boolean };

function parseDB(raw: string | undefined): ParseResult {
  if (!raw) return { db: DEFAULT_DB, isValid: true, hadValue: false };
  try {
    const parsedValue = JSON.parse(raw) as unknown;
    const parsed =
      typeof parsedValue === "string"
        ? (JSON.parse(parsedValue) as unknown)
        : parsedValue;
    if (!isRecord(parsed)) {
      return { db: DEFAULT_DB, isValid: false, hadValue: true };
    }
    if (typeof parsed.version !== "number" || !Array.isArray(parsed.groups)) {
      return { db: DEFAULT_DB, isValid: false, hadValue: true };
    }
    const groups = parsed.groups
      .map(normalizeGroup)
      .filter(Boolean) as LinkGroup[];
    return {
      db: { version: CURRENT_DB_VERSION, groups },
      isValid: true,
      hadValue: true,
    };
  } catch {
    return { db: DEFAULT_DB, isValid: false, hadValue: true };
  }
}

export function parseImportedDB(raw: string): LinkDB {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("The selected file is not a valid Link Groups backup.");
  }

  if (
    !isRecord(value) ||
    value.version !== CURRENT_DB_VERSION ||
    !Array.isArray(value.groups)
  ) {
    throw new Error("The selected file is not a valid Link Groups backup.");
  }

  const groups = value.groups.map((group) => {
    if (!isRecord(group) || !Array.isArray(group.links)) return null;
    if (group.links.some((link) => normalizeLink(link) === null)) return null;
    return normalizeGroup(group);
  });

  if (groups.some((group) => group === null)) {
    throw new Error("The backup contains an invalid group or link.");
  }

  return { version: CURRENT_DB_VERSION, groups: groups as LinkGroup[] };
}

let databaseQueue: Promise<unknown> = Promise.resolve();
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let pendingRefresh: Promise<unknown> | undefined;
let syncUnavailable = false;
const SYNC_JOINED_KEY = "link-groups-sync-joined";
const SYNC_OFFLINE_BASE_KEY = "link-groups-sync-offline-base";
const SYNC_CLIENT_KEY = "link-groups-sync-client";
type OfflineChanges = {
  db: LinkDB;
  local?: LinkDB;
  reconciliation: SyncReconciliation;
};

function parseOfflineChanges(raw: string): OfflineChanges {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    !isRecord(value.reconciliation) ||
    !asNonEmptyString(value.reconciliation.clientId) ||
    !asNonEmptyString(value.reconciliation.id)
  )
    throw new Error("Invalid offline sync state.");
  return {
    db: parseImportedDB(JSON.stringify(value.db)),
    local:
      value.local === undefined
        ? undefined
        : parseImportedDB(JSON.stringify(value.local)),
    reconciliation: {
      clientId: value.reconciliation.clientId as string,
      id: value.reconciliation.id as string,
    },
  };
}

function isSameSyncTarget(
  joined: string | undefined,
  config: SyncConfig,
): boolean {
  if (!joined) return false;
  try {
    const previous: unknown = JSON.parse(joined);
    // Transport paths and property order do not change the remote home directory.
    return (
      isRecord(previous) &&
      !Array.isArray(previous) &&
      previous.sshHost === config.sshHost
    );
  } catch {
    return false;
  }
}

async function recoverOfflineChanges(localDB: LinkDB, title: string) {
  const { filename } = await archiveDB(localDB, "offline-recovery");
  await LocalStorage.removeItem(SYNC_OFFLINE_BASE_KEY);
  try {
    await showToast({
      style: Toast.Style.Failure,
      title,
      message: `Cached groups saved to ${filename}. Reloading shared groups.`,
    });
  } catch {
    // Toast may be unavailable in a background command.
  }
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = databaseQueue.then(() => withDatabaseLock(operation));
  databaseQueue = result.catch(() => {});
  return result;
}

async function withDatabaseLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(environment.supportPath, { recursive: true, mode: 0o700 });
  // UI and no-view commands have separate JS queues but share LocalStorage.
  // tee echoes our readiness signal only after lockf acquires the lock, then
  // exits when stdin closes (including if this command runtime exits).
  const holder = spawn("/usr/bin/lockf", [
    "-k",
    join(environment.supportPath, "database.lock"),
    "/usr/bin/tee",
  ]);
  let diagnostic = "";
  holder.stderr.on("data", (chunk: Buffer) => {
    diagnostic = (diagnostic + chunk.toString()).slice(0, 500);
  });
  const exited = new Promise<void>((resolve, reject) => {
    holder.once("error", reject);
    holder.once("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`Unable to lock group storage. ${diagnostic.trim()}`));
    });
  });
  const acquired = new Promise<void>((resolve, reject) => {
    holder.stdout.once("data", () => resolve());
    holder.stdin.on("error", reject);
    void exited.then(
      () => reject(new Error("Group storage lock closed before acquisition.")),
      reject,
    );
  });
  try {
    holder.stdin.write("locked\n");
    await acquired;
    return await operation();
  } finally {
    holder.stdin.end();
    await exited;
  }
}

async function saveLocalDB(db: LinkDB): Promise<void> {
  const raw = JSON.stringify(db);
  const currentRaw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (currentRaw !== raw) {
    if (currentRaw) await LocalStorage.setItem(BACKUP_STORAGE_KEY, currentRaw);
    await LocalStorage.setItem(STORAGE_KEY, raw);
  }
  setLiveDb(db);
}

async function loadSyncState(
  config: SyncConfig,
  localDB: LinkDB,
): Promise<SyncState> {
  const identity = JSON.stringify(config);
  const joined = await LocalStorage.getItem<string>(SYNC_JOINED_KEY);
  const sameTarget = isSameSyncTarget(joined, config);
  const offlineBase = await LocalStorage.getItem<string>(SYNC_OFFLINE_BASE_KEY);
  let response = await requestSync(
    config,
    sameTarget ? { action: "read" } : { action: "join", db: localDB },
  );
  if ("conflict" in response)
    throw new Error("Unexpected synchronization conflict.");
  let pending: OfflineChanges | undefined;
  if (!sameTarget && offlineBase) {
    await recoverOfflineChanges(localDB, "Sync target changed");
  }
  if (sameTarget && offlineBase) {
    try {
      pending = parseOfflineChanges(offlineBase);
    } catch {
      await recoverOfflineChanges(localDB, "Offline sync state recovered");
    }
  }
  if (pending) {
    // Freeze the payload before sending: a lost response can leave this
    // operation pending while the user makes further edits with sync disabled.
    if (!pending.local) {
      pending.local = localDB;
      await LocalStorage.setItem(
        SYNC_OFFLINE_BASE_KEY,
        JSON.stringify(pending),
      );
    }
    while (pending) {
      const baseline = parseImportedDB(JSON.stringify(pending.db));
      const local = parseImportedDB(JSON.stringify(pending.local));
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = {
          ...response,
          db: parseImportedDB(JSON.stringify(response.db)),
        };
        await recordSyncStatus(current);
        const result = await requestSync(config, {
          action: "write",
          revision: current.revision,
          db: reconcileOfflineDB(baseline, local, current.db),
          reconciliation: pending.reconciliation,
        });
        if (!("conflict" in result)) {
          response = result;
          break;
        }
        if (attempt === 2)
          throw new Error(
            "Groups changed on another Mac. Please try your change again.",
          );
        response = await requestSync(config, { action: "read" });
        if ("conflict" in response)
          throw new Error("Unexpected synchronization conflict.");
      }
      if (JSON.stringify(pending.local) === JSON.stringify(localDB)) {
        pending = undefined;
      } else {
        pending = {
          db: local,
          local: localDB,
          reconciliation: {
            clientId: pending.reconciliation.clientId,
            id: randomUUID(),
          },
        };
        await LocalStorage.setItem(
          SYNC_OFFLINE_BASE_KEY,
          JSON.stringify(pending),
        );
      }
    }
  }
  const state = {
    ...response,
    db: parseImportedDB(JSON.stringify(response.db)),
  };
  // The remote has accepted these edits; do not replay them after caching.
  if (offlineBase) await LocalStorage.removeItem(SYNC_OFFLINE_BASE_KEY);
  await saveLocalDB(state.db);
  if (joined !== identity)
    await LocalStorage.setItem(SYNC_JOINED_KEY, identity);
  await recordSyncStatus(state);
  syncUnavailable = false;
  return state;
}

async function archiveDB(db: LinkDB, prefix: string) {
  const raw = JSON.stringify(db);
  const hash = createHash("sha256").update(raw).digest("hex");
  const backups = join(environment.supportPath, "backups");
  await mkdir(backups, { recursive: true, mode: 0o700 });
  const filename = join(backups, `${prefix}-${hash}.json`);
  try {
    await writeFile(filename, raw, {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return { hash, filename };
}

async function recordSyncStatus(state: SyncState) {
  const { hash } = await archiveDB(state.db, `revision-${state.revision}`);
  await writeFile(
    join(environment.supportPath, "sync-status.json"),
    JSON.stringify({
      lastSuccess: new Date().toISOString(),
      revision: state.revision,
      groups: state.db.groups.length,
      links: state.db.groups.reduce(
        (count, group) => count + group.links.length,
        0,
      ),
      hash,
    }),
    { mode: 0o600 },
  );
}

function refreshDB() {
  if (!pendingRefresh) {
    pendingRefresh = readDB()
      .catch((error) =>
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to load groups",
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => {
        pendingRefresh = undefined;
      });
  }
  return pendingRefresh;
}

export function useLinkDB() {
  const [db, setDb] = useState(liveDb);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    dbListeners.add(setDb);
    // Catch up on a change published between render and subscription.
    setDb(liveDb);
    void refreshDB().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        void refreshDB();
      }, 5000);
    }
    return () => {
      cancelled = true;
      dbListeners.delete(setDb);
      if (dbListeners.size === 0) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
      }
    };
  }, []);
  return { db, updateDB, isLoading };
}

export function updateDB(updater: (current: LinkDB) => LinkDB): Promise<void> {
  return enqueue(async () => {
    const localDB = await readLocalDB();
    const config = await readSyncConfig(environment.supportPath);
    if (!config) {
      if (
        (await LocalStorage.getItem<string>(SYNC_JOINED_KEY)) &&
        !(await LocalStorage.getItem<string>(SYNC_OFFLINE_BASE_KEY))
      ) {
        const clientId =
          (await LocalStorage.getItem<string>(SYNC_CLIENT_KEY)) ?? randomUUID();
        await LocalStorage.setItem(SYNC_CLIENT_KEY, clientId);
        await LocalStorage.setItem(
          SYNC_OFFLINE_BASE_KEY,
          JSON.stringify({
            db: localDB,
            reconciliation: { clientId, id: randomUUID() },
          } satisfies OfflineChanges),
        );
      }
      await saveLocalDB(updater(localDB));
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await loadSyncState(config, localDB);
      const next = updater(current.db);
      const response = await requestSync(config, {
        action: "write",
        revision: current.revision,
        db: next,
      });
      if ("conflict" in response) continue;
      const state = {
        ...response,
        db: parseImportedDB(JSON.stringify(response.db)),
      };
      await saveLocalDB(state.db);
      await recordSyncStatus(state);
      return;
    }
    throw new Error(
      "Groups changed on another Mac. Please try your change again.",
    );
  });
}

export function readDB(): Promise<LinkDB> {
  return enqueue(async () => {
    const localDB = await readLocalDB();
    // Show cached groups right away; the sync round trip can take seconds.
    setLiveDb(localDB);
    try {
      const config = await readSyncConfig(environment.supportPath);
      if (config) return (await loadSyncState(config, localDB)).db;
    } catch (error) {
      if (!syncUnavailable) {
        syncUnavailable = true;
        await showToast({
          style: Toast.Style.Failure,
          title: "Group sync unavailable",
          message: `Showing cached groups. ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return localDB;
  });
}

async function readLocalDB(): Promise<LinkDB> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (await LocalStorage.getItem<string>(SYNC_OFFLINE_BASE_KEY)) {
    try {
      parseImportedDB(raw ?? "");
    } catch {
      // Tolerant cache parsing may drop damaged records. Never publish those
      // omissions (or a recovery snapshot) as intentional user deletions.
      await LocalStorage.removeItem(SYNC_OFFLINE_BASE_KEY);
    }
  }
  const parsed = parseDB(raw);
  if (parsed.isValid || !parsed.hadValue) return parsed.db;

  const backupRaw = await LocalStorage.getItem<string>(BACKUP_STORAGE_KEY);
  const backupParsed = parseDB(backupRaw);

  if (backupParsed.isValid && backupParsed.hadValue && backupRaw) {
    await LocalStorage.setItem(STORAGE_KEY, backupRaw);
    try {
      await showToast({
        style: Toast.Style.Failure,
        title: "Data corrupted",
        message: "Recovered from the last backup.",
      });
    } catch {
      // Toast not available in background mode - silent recovery
    }
    return backupParsed.db;
  }

  await LocalStorage.setItem(STORAGE_KEY, DEFAULT_DB_RAW);
  try {
    await showToast({
      style: Toast.Style.Failure,
      title: "Data corrupted",
      message: "Reset to an empty database.",
    });
  } catch {
    // Toast not available in background mode - silent recovery
  }
  return DEFAULT_DB;
}
