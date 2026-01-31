import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { randomUUID } from "crypto";
import { useEffect, useRef } from "react";

import { useLinkDB } from "./lib/storage";
import { openAllUrls } from "./lib/openAll";
import type { LinkItem } from "./lib/types";

/**
 * Extracts a title from a URL (uses pathname or hostname)
 */
function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Use last path segment or hostname
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      const last = pathSegments[pathSegments.length - 1];
      // Decode and clean up
      return decodeURIComponent(last).replace(/[-_]/g, " ").slice(0, 50);
    }
    return parsed.hostname;
  } catch {
    return url.slice(0, 50);
  }
}

/**
 * Parses bulk text input into URLs (one per line)
 */
function parseUrls(text: string): string[] {
  return text
    .split(/[\n\r]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseUrlsWithValidation(text: string): {
  valid: string[];
  invalid: string[];
} {
  const lines = parseUrls(text);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    const normalized = normalizeUrl(line);
    if (normalized) {
      valid.push(normalized);
    } else {
      invalid.push(line);
    }
  }

  return { valid, invalid };
}

export default function GroupLinks(props: { groupId: string }) {
  const { db, updateDB, isLoading } = useLinkDB();
  const group = db.groups.find((g) => g.id === props.groupId);
  const { pop } = useNavigation();
  const missingNotifiedRef = useRef(false);

  useEffect(() => {
    if (isLoading || group) return;
    if (missingNotifiedRef.current) return;
    missingNotifiedRef.current = true;

    void showToast({
      style: Toast.Style.Failure,
      title: "Group not found",
    });
    pop();
  }, [group, isLoading, pop]);

  async function addLink(title: string, url: string) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Invalid URL",
        message: "Use a valid http(s) URL.",
      });
      return;
    }

    try {
      let added = false;
      await updateDB((current) => {
        const nextLink = { id: randomUUID(), title, url: normalized };
        const nextGroups = current.groups.map((g) => {
          if (g.id !== props.groupId) return g;
          added = true;
          return { ...g, links: [nextLink, ...g.links] };
        });
        if (!added) return current;
        return { ...current, groups: nextGroups };
      });

      if (!added) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Group not found",
        });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add link",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function addLinks(links: LinkItem[]): Promise<boolean> {
    if (links.length === 0) return false;

    try {
      let added = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((g) => {
          if (g.id !== props.groupId) return g;
          added = true;
          return { ...g, links: [...links, ...g.links] };
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
        title: "Failed to import links",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async function deleteLink(linkId: string) {
    try {
      let deleted = false;
      let foundGroup = false;
      await updateDB((current) => {
        const nextGroups = current.groups.map((g) => {
          if (g.id !== props.groupId) return g;
          foundGroup = true;
          const nextLinks = g.links.filter((l) => l.id !== linkId);
          if (nextLinks.length === g.links.length) return g;
          deleted = true;
          return { ...g, links: nextLinks };
        });
        if (!deleted) return current;
        return { ...current, groups: nextGroups };
      });

      if (!deleted) {
        await showToast({
          style: Toast.Style.Failure,
          title: foundGroup ? "Link not found" : "Group not found",
        });
        return;
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Link deleted",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete link",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!group) {
    return <List isLoading={isLoading} searchBarPlaceholder="Search…" />;
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={group.title}
      searchBarPlaceholder="Search links…"
    >
      <List.EmptyView
        title="No links yet"
        description="Add your first link."
        actions={
          <ActionPanel>
            <Action.Push
              title="Add Link"
              icon={Icon.Plus}
              target={<AddLinkForm onCreate={addLink} />}
            />
            <Action.Push
              title="Bulk Import URLs"
              icon={Icon.Document}
              target={<BulkImportForm onImport={addLinks} />}
            />
          </ActionPanel>
        }
      />

      {group.links.map((link) => (
        <List.Item
          key={link.id}
          title={link.title}
          subtitle={link.url}
          icon={Icon.Link}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser url={link.url} />
              <Action.CopyToClipboard title="Copy URL" content={link.url} />

              <ActionPanel.Section>
                <Action
                  title="Open All Links in Group"
                  icon={Icon.Globe}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  onAction={() =>
                    openAllUrls(
                      group.links.map((l) => l.url),
                      group.browser,
                    )
                  }
                />
                <Action.Push
                  title="Add Link"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  target={<AddLinkForm onCreate={addLink} />}
                />
                <Action.Push
                  title="Bulk Import URLs"
                  icon={Icon.Document}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                  target={<BulkImportForm onImport={addLinks} />}
                />
                <Action
                  title="Delete Link"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => deleteLink(link.id)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function AddLinkForm(props: {
  onCreate: (title: string, url: string) => Promise<void>;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Link"
            onSubmit={async (values) => {
              const title = String(values.title ?? "").trim();
              const url = String(values.url ?? "").trim();
              if (!title || !url) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Title and URL are required",
                });
                return;
              }

              const normalized = normalizeUrl(url);
              if (!normalized) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Invalid URL",
                  message: "Use a valid http(s) URL.",
                });
                return;
              }

              await props.onCreate(title, normalized);
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="e.g. GitHub"
        autoFocus
      />
      <Form.TextField id="url" title="URL" placeholder="https://…" />
    </Form>
  );
}

function BulkImportForm(props: {
  onImport: (links: LinkItem[]) => Promise<boolean>;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import URLs"
            onSubmit={async (values) => {
              const text = String(values.urls ?? "").trim();
              if (!text) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "No URLs provided",
                });
                return;
              }

              const { valid, invalid } = parseUrlsWithValidation(text);
              if (valid.length === 0) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "No valid URLs found",
                });
                return;
              }

              const links: LinkItem[] = valid.map((url) => ({
                id: randomUUID(),
                title: titleFromUrl(url),
                url,
              }));

              const imported = await props.onImport(links);
              if (!imported) {
                return;
              }
              await showToast({
                style: Toast.Style.Success,
                title: `Imported ${links.length} links`,
                message:
                  invalid.length > 0
                    ? `Skipped ${invalid.length} invalid URL${invalid.length === 1 ? "" : "s"}.`
                    : undefined,
              });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="urls"
        title="URLs"
        placeholder="Paste URLs here, one per line…"
        autoFocus
      />
      <Form.Description text="Each line will be imported as a separate link. Titles are auto-generated from the URL." />
    </Form>
  );
}
