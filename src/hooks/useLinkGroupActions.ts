import { Alert, confirmAlert, showToast, Toast } from "@raycast/api";
import { randomUUID } from "crypto";

import { useLinkDB } from "../lib/storage";
import type { Browser, LinkGroup, LinkItem } from "../lib/types";
import { normalizeUrl, titleFromUrl } from "../lib/url-utils";

export type AddLinksResult = {
  added: number;
  failed: number;
};

export function useLinkGroupActions() {
  const { db, updateDB, isLoading } = useLinkDB();

  function getGroup(groupId: string): LinkGroup | undefined {
    return db.groups.find((group) => group.id === groupId);
  }

  async function addGroup(
    title: string,
    browser: Browser = "",
  ): Promise<LinkGroup | null> {
    const next: LinkGroup = { id: randomUUID(), title, links: [], browser };
    try {
      await updateDB((current) => ({
        ...current,
        groups: [next, ...current.groups],
      }));
      return next;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to create group",
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async function deleteGroup(groupId: string): Promise<boolean> {
    const group = db.groups.find((candidate) => candidate.id === groupId);
    if (!group) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Group not found",
      });
      return false;
    }

    const confirmed = await confirmAlert({
      title: "Delete group?",
      message: `This will delete "${group.title}" and ${group.links.length} link${group.links.length === 1 ? "" : "s"}.`,
      primaryAction: {
        title: "Delete Group",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return false;

    try {
      let deleted = false;
      await updateDB((current) => {
        if (!current.groups.some((candidate) => candidate.id === groupId)) {
          return current;
        }
        deleted = true;
        return {
          ...current,
          groups: current.groups.filter(
            (groupItem) => groupItem.id !== groupId,
          ),
        };
      });

      if (!deleted) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
        return false;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Group deleted",
      });
      return true;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete group",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function updateGroupBrowser(
    groupId: string,
    browser: Browser,
  ): Promise<boolean> {
    try {
      let updated = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((group) => {
          if (group.id !== groupId) return group;
          updated = true;
          return { ...group, browser };
        });
        if (!updated) return current;
        return { ...current, groups: nextGroups };
      });

      if (!updated) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
        return false;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Browser updated",
      });
      return true;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update browser",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function updateGroup(
    groupId: string,
    title: string,
    browser: Browser,
  ): Promise<boolean> {
    try {
      let updated = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((group) => {
          if (group.id !== groupId) return group;
          updated = true;
          return { ...group, title, browser };
        });
        if (!updated) return current;
        return { ...current, groups: nextGroups };
      });

      if (!updated) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
        return false;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Group updated",
      });
      return true;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update group",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function addLink(
    groupId: string,
    title: string,
    url: string,
  ): Promise<boolean> {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid URL",
        message: "Use a valid http(s) URL.",
      });
      return false;
    }

    try {
      let added = false;
      await updateDB((current) => {
        const nextLink: LinkItem = { id: randomUUID(), title, url: normalized };
        const nextGroups = current.groups.map((group) => {
          if (group.id !== groupId) return group;
          added = true;
          return { ...group, links: [nextLink, ...group.links] };
        });
        if (!added) return current;
        return { ...current, groups: nextGroups };
      });

      if (!added) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
        return false;
      }

      return true;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add link",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function addLinks(
    groupId: string,
    urls: string[],
  ): Promise<AddLinksResult> {
    if (urls.length === 0) return { added: 0, failed: 0 };

    const links: LinkItem[] = urls.map((url) => ({
      id: randomUUID(),
      title: titleFromUrl(url),
      url,
    }));

    try {
      let added = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((group) => {
          if (group.id !== groupId) return group;
          added = true;
          return { ...group, links: [...links, ...group.links] };
        });
        if (!added) return current;
        return { ...current, groups: nextGroups };
      });

      if (!added) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
        return { added: 0, failed: urls.length };
      }

      return { added: urls.length, failed: 0 };
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to import links",
        message: error instanceof Error ? error.message : String(error),
      });
      return { added: 0, failed: urls.length };
    }
  }

  async function deleteLink(groupId: string, linkId: string): Promise<boolean> {
    try {
      let deleted = false;
      let foundGroup = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((group) => {
          if (group.id !== groupId) return group;
          foundGroup = true;
          const nextLinks = group.links.filter((link) => link.id !== linkId);
          if (nextLinks.length === group.links.length) return group;
          deleted = true;
          return { ...group, links: nextLinks };
        });
        if (!deleted) return current;
        return { ...current, groups: nextGroups };
      });

      if (!deleted) {
        await showToast({
          style: Toast.Style.Failure,
          title: foundGroup ? "Link not found" : "Group not found",
        });
        return false;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Link deleted",
      });
      return true;
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete link",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function editLinks(
    groupId: string,
    keepUrls: string[],
    addUrls: string[],
  ): Promise<{ removed: number; added: number }> {
    const keepCounts = new Map<string, number>();
    for (const url of keepUrls) {
      keepCounts.set(url, (keepCounts.get(url) || 0) + 1);
    }

    const newLinks: LinkItem[] = addUrls.map((url) => ({
      id: randomUUID(),
      title: titleFromUrl(url),
      url,
    }));

    try {
      let removed = 0;
      let foundGroup = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((group) => {
          if (group.id !== groupId) return group;
          foundGroup = true;

          const keptLinks: LinkItem[] = [];
          const urlCounts = new Map<string, number>();

          for (const link of group.links) {
            const currentCount = urlCounts.get(link.url) || 0;
            const maxCount = keepCounts.get(link.url) || 0;

            if (currentCount < maxCount) {
              keptLinks.push(link);
              urlCounts.set(link.url, currentCount + 1);
            }
          }

          removed = group.links.length - keptLinks.length;
          return { ...group, links: [...newLinks, ...keptLinks] };
        });
        if (!foundGroup) return current;
        return { ...current, groups: nextGroups };
      });

      if (!foundGroup) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
        return { removed: 0, added: 0 };
      }

      return { removed, added: newLinks.length };
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to edit links",
        message: error instanceof Error ? error.message : String(error),
      });
      return { removed: 0, added: 0 };
    }
  }

  return {
    db,
    isLoading,
    groups: db.groups,
    addGroup,
    deleteGroup,
    updateGroup,
    updateGroupBrowser,
    addLink,
    addLinks,
    deleteLink,
    editLinks,
    getGroup,
  };
}
