import { LocalStorage, showToast, Toast } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Browser, LinkDB, LinkGroup, LinkItem } from "./types";
import { BROWSER_OPTIONS } from "./types";

const STORAGE_KEY = "link-groups-db";
const BACKUP_STORAGE_KEY = "link-groups-db-backup";

const CURRENT_DB_VERSION = 1;
const DEFAULT_DB: LinkDB = { version: CURRENT_DB_VERSION, groups: [] };
const DEFAULT_DB_RAW = JSON.stringify(DEFAULT_DB);

const VALID_BROWSERS = new Set(BROWSER_OPTIONS.map((option) => option.value));

let liveDb: LinkDB = DEFAULT_DB;
const dbListeners = new Set<(db: LinkDB) => void>();

function setLiveDb(next: LinkDB) {
  if (liveDb === next) return;
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

export function useLinkDB() {
  const {
    value: raw,
    setValue: setRaw,
    isLoading,
  } = useLocalStorage<string>(STORAGE_KEY, DEFAULT_DB_RAW);

  const parsed = useMemo(() => parseDB(raw), [raw]);
  const [db, setDb] = useState<LinkDB>(() =>
    liveDb === DEFAULT_DB ? parsed.db : liveDb,
  );

  const queueRef = useRef(Promise.resolve());
  const lastCorruptRef = useRef<string | null>(null);

  useEffect(() => {
    dbListeners.add(setDb);
    return () => {
      dbListeners.delete(setDb);
    };
  }, []);

  useEffect(() => {
    setLiveDb(parsed.db);
  }, [parsed.db]);

  useEffect(() => {
    if (!parsed.hadValue || parsed.isValid) return;
    if (raw && lastCorruptRef.current === raw) return;
    lastCorruptRef.current = raw ?? null;

    let cancelled = false;

    void (async () => {
      try {
        const backupRaw =
          await LocalStorage.getItem<string>(BACKUP_STORAGE_KEY);
        const backupParsed = parseDB(backupRaw);
        if (cancelled) return;

        if (backupParsed.isValid && backupParsed.hadValue && backupRaw) {
          await setRaw(backupRaw);
          await showToast({
            style: Toast.Style.Failure,
            title: "Data corrupted",
            message: "Recovered from the last backup.",
          });
          return;
        }

        await setRaw(DEFAULT_DB_RAW);
        await showToast({
          style: Toast.Style.Failure,
          title: "Data corrupted",
          message: "Reset to an empty database.",
        });
      } catch (error) {
        if (cancelled) return;
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to recover data",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parsed.hadValue, parsed.isValid, raw, setRaw]);

  async function setDB(next: LinkDB) {
    await updateDB(() => next);
  }

  async function updateDB(updater: (current: LinkDB) => LinkDB) {
    const run = queueRef.current.then(async () => {
      const currentRaw =
        (await LocalStorage.getItem<string>(STORAGE_KEY)) ?? DEFAULT_DB_RAW;
      const current = parseDB(currentRaw).db;
      const next = updater(current);
      const nextRaw = JSON.stringify(next);

      if (currentRaw) {
        await LocalStorage.setItem(BACKUP_STORAGE_KEY, currentRaw);
      }

      await setRaw(nextRaw);
    });

    queueRef.current = run.catch(() => {});
    return run;
  }

  return { db, setDB, updateDB, isLoading };
}

export async function readDB(): Promise<LinkDB> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
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

export async function writeDB(db: LinkDB): Promise<void> {
  const raw = JSON.stringify(db);
  const currentRaw = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (currentRaw) {
    await LocalStorage.setItem(BACKUP_STORAGE_KEY, currentRaw);
  }
  await LocalStorage.setItem(STORAGE_KEY, raw);
}
