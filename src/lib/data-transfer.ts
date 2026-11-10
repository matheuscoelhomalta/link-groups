import { randomUUID } from "node:crypto";

import type { LinkDB, LinkGroup, LinkItem } from "./types";

function reconcileOrder<T extends { id: string }>(
  baseline: T[],
  local: T[],
  remote: T[],
): T[] {
  const beforeIds = new Set(baseline.map((item) => item.id));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const common = local.filter(
    (item) => beforeIds.has(item.id) && remoteById.has(item.id),
  );
  const commonIds = new Set(common.map((item) => item.id));
  const beforeOrder = baseline.filter((item) => commonIds.has(item.id));
  // An explicit local reorder wins; otherwise preserve the remote order.
  let next = 0;
  const ordered = common.some(
    (item, index) => item.id !== beforeOrder[index].id,
  )
    ? remote.map((item) =>
        commonIds.has(item.id) ? remoteById.get(common[next++].id)! : item,
      )
    : remote;
  const additions = new Map<string | undefined, T[]>();
  let anchor: string | undefined;
  for (const item of local.toReversed()) {
    if (remoteById.has(item.id)) anchor = item.id;
    else if (!beforeIds.has(item.id)) {
      const items = additions.get(anchor) ?? [];
      items.push(item);
      additions.set(anchor, items);
    }
  }
  return [
    ...ordered.flatMap((item) => [
      ...(additions.get(item.id) ?? []).toReversed(),
      item,
    ]),
    ...(additions.get(undefined) ?? []).toReversed(),
  ];
}

// Apply only edits since sync was disabled. A remote deletion wins over an
// edit to an old record; only IDs absent from the baseline are new additions.
export function reconcileOfflineDB(
  baseline: LinkDB,
  local: LinkDB,
  remote: LinkDB,
): LinkDB {
  const before = new Map(baseline.groups.map((group) => [group.id, group]));
  const after = new Map(local.groups.map((group) => [group.id, group]));
  const groups = remote.groups.flatMap((group) => {
    const previous = before.get(group.id);
    const edited = after.get(group.id);
    if (!previous) {
      return edited
        ? [{ ...group, links: reconcileOrder([], edited.links, group.links) }]
        : [group];
    }
    if (!edited) return [];
    const beforeLinks = new Map(previous.links.map((link) => [link.id, link]));
    const afterLinks = new Map(edited.links.map((link) => [link.id, link]));
    const links = group.links.flatMap((link) => {
      const oldLink = beforeLinks.get(link.id);
      const editedLink = afterLinks.get(link.id);
      if (!oldLink) return [link];
      if (!editedLink) return [];
      return [
        {
          ...link,
          title:
            editedLink.title !== oldLink.title ? editedLink.title : link.title,
          url: editedLink.url !== oldLink.url ? editedLink.url : link.url,
        },
      ];
    });
    return [
      {
        ...group,
        title: edited.title !== previous.title ? edited.title : group.title,
        browser:
          edited.browser !== previous.browser ? edited.browser : group.browser,
        links: reconcileOrder(previous.links, edited.links, links),
      },
    ];
  });
  return {
    ...remote,
    groups: reconcileOrder(baseline.groups, local.groups, groups),
  };
}

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
