import {
  Action,
  ActionPanel,
  Icon,
  List,
  open,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef } from "react";

import AddLinkForm from "./components/AddLinkForm";
import BulkImportForm from "./components/BulkImportForm";
import EditLinksForm from "./components/EditLinksForm";
import { useLinkGroupActions } from "./hooks/useLinkGroupActions";
import { openAllUrls } from "./lib/openAll";

export default function GroupLinks(props: { groupId: string }) {
  const { isLoading, addLink, addLinks, deleteLink, editLinks, getGroup } =
    useLinkGroupActions();
  const group = getGroup(props.groupId);
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
              target={
                <AddLinkForm
                  onCreate={(title, url) => addLink(props.groupId, title, url)}
                />
              }
            />
            <Action.Push
              title="Bulk Import Urls"
              icon={Icon.Document}
              target={
                <BulkImportForm
                  onImport={(urls) => addLinks(props.groupId, urls)}
                />
              }
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
                  target={
                    <AddLinkForm
                      onCreate={(title, url) =>
                        addLink(props.groupId, title, url)
                      }
                    />
                  }
                />
                <Action.Push
                  title="Bulk Import Urls"
                  icon={Icon.Document}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
                  target={
                    <BulkImportForm
                      onImport={(urls) => addLinks(props.groupId, urls)}
                    />
                  }
                />
                <Action.Push
                  title="Edit Links"
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                  target={
                    <EditLinksForm
                      links={group.links}
                      onSave={(keepUrls, addUrls) =>
                        editLinks(props.groupId, keepUrls, addUrls)
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
