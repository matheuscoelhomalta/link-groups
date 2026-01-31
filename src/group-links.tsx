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

export default function GroupLinks(props: { groupId: string }) {
  const { db, setDB, isLoading } = useLinkDB();
  const group = db.groups.find((g) => g.id === props.groupId);

  async function addLink(title: string, url: string) {
    if (!group) return;

    const nextLink = { id: randomUUID(), title, url };

    const nextGroups = db.groups.map((g) => {
      if (g.id !== group.id) return g;
      return { ...g, links: [nextLink, ...g.links] };
    });

    await setDB({ ...db, groups: nextGroups });
  }

  async function addLinks(links: LinkItem[]) {
    if (!group || links.length === 0) return;

    const nextGroups = db.groups.map((g) => {
      if (g.id !== group.id) return g;
      return { ...g, links: [...links, ...g.links] };
    });

    await setDB({ ...db, groups: nextGroups });
  }

  async function deleteLink(linkId: string) {
    if (!group) return;
    const nextGroups = db.groups.map((g) => {
      if (g.id !== group.id) return g;
      return { ...g, links: g.links.filter((l) => l.id !== linkId) };
    });
    await setDB({ ...db, groups: nextGroups });
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
              await props.onCreate(title, url);
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

function BulkImportForm(props: { onImport: (links: LinkItem[]) => Promise<void> }) {
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

              const urls = parseUrls(text);
              if (urls.length === 0) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "No valid URLs found",
                });
                return;
              }

              const links: LinkItem[] = urls.map((url) => ({
                id: randomUUID(),
                title: titleFromUrl(url),
                url,
              }));

              await props.onImport(links);
              await showToast({
                style: Toast.Style.Success,
                title: `Imported ${links.length} links`,
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
