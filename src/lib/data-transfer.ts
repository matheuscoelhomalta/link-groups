import { randomUUID } from "crypto";

import type { LinkDB, LinkGroup, LinkItem } from "./types";

export type ImportMode = "merge" | "replace";

export type MergeResult = {
  db: LinkDB;
  groupsAdded: number;
  linksAdded: number;
};

function groupKey(title: string): string {
  return title.trim().toLocaleLowerCase();
}

function ensureUniqueId(id: string, usedIds: Set<string>): string {
  let nextId = id;
  while (usedIds.has(nextId)) nextId = randomUUID();
  usedIds.add(nextId);
  return nextId;
}

function addUniqueLinks(
  currentLinks: LinkItem[],
  importedLinks: LinkItem[],
): { links: LinkItem[]; added: number } {
  const urls = new Set(currentLinks.map((link) => link.url));
  const ids = new Set(currentLinks.map((link) => link.id));
  const additions: LinkItem[] = [];

  for (const link of importedLinks) {
    if (urls.has(link.url)) continue;
    urls.add(link.url);
    additions.push({ ...link, id: ensureUniqueId(link.id, ids) });
  }

  return { links: [...currentLinks, ...additions], added: additions.length };
}

export function mergeLinkDB(current: LinkDB, imported: LinkDB): MergeResult {
  const groups = [...current.groups];
  const groupIds = new Set(groups.map((group) => group.id));
  let groupsAdded = 0;
  let linksAdded = 0;

  for (const importedGroup of imported.groups) {
    const existingIndex = groups.findIndex(
      (group) => groupKey(group.title) === groupKey(importedGroup.title),
    );

    if (existingIndex >= 0) {
      const merged = addUniqueLinks(
        groups[existingIndex].links,
        importedGroup.links,
      );
      groups[existingIndex] = { ...groups[existingIndex], links: merged.links };
      linksAdded += merged.added;
      continue;
    }

    const linkIds = new Set<string>();
    const group: LinkGroup = {
      ...importedGroup,
      id: ensureUniqueId(importedGroup.id, groupIds),
      links: importedGroup.links.map((link) => ({
        ...link,
        id: ensureUniqueId(link.id, linkIds),
      })),
    };
    groups.push(group);
    groupsAdded += 1;
    linksAdded += group.links.length;
  }

  return {
    db: { version: 1, groups },
    groupsAdded,
    linksAdded,
  };
}
