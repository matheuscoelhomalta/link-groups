import { Action, ActionPanel, Icon, List, open } from "@raycast/api";

import AddLinkForm from "./components/AddLinkForm";
import BulkImportForm from "./components/BulkImportForm";
import EditLinksForm from "./components/EditLinksForm";
import { useLinkGroupActions } from "./hooks/useLinkGroupActions";
import { openAllUrls } from "./lib/openAll";

export default function GroupLinks(props: { groupId: string }) {
  const { isLoading, addLink, addLinks, deleteLink, editLinks, getGroup } =
    useLinkGroupActions();
  const group = getGroup(props.groupId);

  if (!group) {
    return (
      <List isLoading={isLoading} searchBarPlaceholder="Search…">
        {!isLoading && (
          <List.EmptyView
            icon={Icon.Warning}
            title="Group not found"
            description="It may have been deleted on another Mac."
          />
        )}
      </List>
    );
  }

  const handleAddLink = (title: string, url: string) =>
    addLink(props.groupId, title, url);
  const handleAddLinks = (urls: string[]) => addLinks(props.groupId, urls);

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
              target={<AddLinkForm onCreate={handleAddLink} />}
            />
            <Action.Push
              title="Bulk Import Urls"
              icon={Icon.Document}
              target={<BulkImportForm onImport={handleAddLinks} />}
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
              <Action
                title="Open in Browser"
                icon={Icon.Globe}
                onAction={() => open(link.url, group.browser || undefined)}
              />
              <Action.CopyToClipboard title="Copy URL" content={link.url} />

              <ActionPanel.Section>
                <Action
                  title="Open All Links in Group"
                  icon={Icon.Globe}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  onAction={() =>
                    openAllUrls(
                      group.links.map((groupLink) => groupLink.url),
                      group.browser,
                    )
                  }
                />
                <Action.Push
                  title="Add Link"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                  target={<AddLinkForm onCreate={handleAddLink} />}
                />
                <Action.Push
                  title="Bulk Import Urls"
                  icon={Icon.Document}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                  target={<BulkImportForm onImport={handleAddLinks} />}
                />
                <Action.Push
                  title="Edit Links"
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                  target={
                    <EditLinksForm
                      links={group.links}
                      onSave={(removeIds, addUrls) =>
                        editLinks(props.groupId, removeIds, addUrls)
                      }
                    />
                  }
                />
                <Action
                  title="Delete Link"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["ctrl"], key: "x" }}
                  onAction={() => deleteLink(props.groupId, link.id)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
