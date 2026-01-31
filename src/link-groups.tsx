import { Action, ActionPanel, Icon, LaunchType, List } from "@raycast/api";
import { createDeeplink, DeeplinkType } from "@raycast/utils";

import AddGroupForm from "./components/AddGroupForm";
import ChangeBrowserForm from "./components/ChangeBrowserForm";
import EditGroupForm from "./components/EditGroupForm";
import GroupLinks from "./group-links";
import { useLinkGroupActions } from "./hooks/useLinkGroupActions";
import { openAllUrls } from "./lib/openAll";
import { getBrowserLabel } from "./lib/types";

export default function LinkGroupsCommand() {
  const {
    groups,
    isLoading,
    addGroup,
    deleteGroup,
    updateGroup,
    updateGroupBrowser,
  } = useLinkGroupActions();

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search groups…">
      <List.EmptyView
        title="No groups yet"
        description="Create a group, then add links inside it."
        actions={
          <ActionPanel>
            <Action.Push
              title="Add Group"
              icon={Icon.Plus}
              target={<AddGroupForm onCreate={addGroup} />}
            />
          </ActionPanel>
        }
      />

      {groups.map((group) => {
        const deeplink = createDeeplink({
          type: DeeplinkType.Extension,
          command: "open-link-group",
          launchType: LaunchType.Background,
          arguments: { groupId: group.id },
        });

        const browserLabel = getBrowserLabel(group.browser);

        return (
          <List.Item
            key={group.id}
            title={group.title}
            subtitle={`${group.links.length} link${group.links.length === 1 ? "" : "s"}`}
            accessories={[{ text: browserLabel, icon: Icon.Globe }]}
            icon={Icon.Folder}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Open Group"
                  icon={Icon.ChevronRight}
                  target={<GroupLinks groupId={group.id} />}
                />

                <Action
                  title="Open All Links"
                  icon={Icon.Globe}
                  onAction={() =>
                    openAllUrls(
                      group.links.map((link) => link.url),
                      group.browser,
                    )
                  }
                />

                <Action.CreateQuicklink
                  title="Create Hotkey Quicklink"
                  quicklink={{
                    name: `Open ${group.title}`,
                    link: deeplink,
                  }}
                />

                <ActionPanel.Section title="Edit">
                  <Action.Push
                    title="Edit Group"
                    icon={Icon.Pencil}
                    shortcut={{ modifiers: ["cmd"], key: "e" }}
                    target={
                      <EditGroupForm group={group} onUpdate={updateGroup} />
                    }
                  />
                  <Action.Push
                    title="Change Browser"
                    icon={Icon.Globe}
                    shortcut={{ modifiers: ["cmd"], key: "b" }}
                    target={
                      <ChangeBrowserForm
                        currentBrowser={group.browser || ""}
                        onSubmit={(browser) =>
                          updateGroupBrowser(group.id, browser)
                        }
                      />
                    }
                  />
                </ActionPanel.Section>

                <ActionPanel.Section>
                  <Action.Push
                    title="Add Group"
                    icon={Icon.Plus}
                    shortcut={{ modifiers: ["cmd"], key: "n" }}
                    target={<AddGroupForm onCreate={addGroup} />}
                  />
                  <Action
                    title="Delete Group"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["ctrl"], key: "x" }}
                    onAction={() => deleteGroup(group.id)}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
