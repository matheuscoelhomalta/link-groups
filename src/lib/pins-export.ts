import type { Browser, LinkDB } from "./types";

export type PinsExportData = {
  groups: {
    name: string;
    icon: string;
    id: number;
  }[];
  pins: {
    name: string;
    url: string;
    icon: string;
    group: string;
    id: number;
    application: string;
  }[];
};

function uniqueName(title: string, usedNames: Set<string>): string {
  let name = title;
  let suffix = 2;

  while (usedNames.has(name)) {
    name = `${title} (${suffix})`;
    suffix += 1;
  }

  usedNames.add(name);
  return name;
}

export function convertToPinsExport(
  db: LinkDB,
  applicationPaths: Partial<Record<Browser, string>>,
): PinsExportData {
  const usedGroupNames = new Set<string>();
  const groupNames = db.groups.map((group) =>
    uniqueName(group.title, usedGroupNames),
  );
  const usedPinNames = new Set<string>();
  let nextPinId = 1;

  return {
    groups: db.groups.map((_group, index) => ({
      name: groupNames[index],
      icon: "Folder",
      id: index + 1,
    })),
    pins: db.groups.flatMap((group, groupIndex) =>
      group.links.map((link) => ({
        name: uniqueName(link.title, usedPinNames),
        url: link.url,
        icon: "Favicon / File Icon",
        group: groupNames[groupIndex],
        id: nextPinId++,
        application: group.browser
          ? (applicationPaths[group.browser] ?? "None")
          : "None",
      })),
    ),
  };
}
