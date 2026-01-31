import { LocalStorage } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import type { Browser, LinkDB, LinkGroup, LinkItem } from "./types";
import { BROWSER_OPTIONS } from "./types";

const STORAGE_KEY = "link-groups-db";

const DEFAULT_DB: LinkDB = { version: 1, groups: [] };

const VALID_BROWSERS = new Set(BROWSER_OPTIONS.map((option) => option.value));

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

function safeParseDB(raw: string | undefined): LinkDB {
  if (!raw) return DEFAULT_DB;
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; groups?: unknown };
    if (parsed?.version !== 1 || !Array.isArray(parsed.groups))
      return DEFAULT_DB;
    const groups = parsed.groups
      .map(normalizeGroup)
      .filter(Boolean) as LinkGroup[];
    return { version: 1, groups };
  } catch {
    return DEFAULT_DB;
  }
}

/**
 * React hook for UI commands - provides reactive state with loading indicator
 */
export function useLinkDB() {
  const {
    value: raw,
    setValue: setRaw,
    isLoading,
  } = useLocalStorage<string>(STORAGE_KEY, JSON.stringify(DEFAULT_DB));

  const db = safeParseDB(raw);

  async function setDB(next: LinkDB) {
    await setRaw(JSON.stringify(next));
  }

  return { db, setDB, isLoading };
}

/**
 * Read database directly - for no-view commands
 */
export async function readDB(): Promise<LinkDB> {
  const raw = await LocalStorage.getItem<string>(STORAGE_KEY);
  return safeParseDB(raw);
}

/**
 * Write database directly - for no-view commands
 */
export async function writeDB(db: LinkDB): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}
