import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LaunchType,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { createDeeplink, DeeplinkType } from "@raycast/utils";
import { randomUUID } from "crypto";

import { useLinkDB } from "./lib/storage";
import type { Browser, LinkGroup } from "./lib/types";
import { BROWSER_OPTIONS } from "./lib/types";
import { openAllUrls } from "./lib/openAll";
import GroupLinks from "./group-links";

export default function LinkGroupsCommand() {
  const { db, setDB, isLoading } = useLinkDB();
  const groups = db.groups;

  async function addGroup(title: string, browser: Browser) {
    const next: LinkGroup = { id: randomUUID(), title, links: [], browser };
    await setDB({ ...db, groups: [next, ...db.groups] });
  }

  async function deleteGroup(groupId: string) {
    await setDB({ ...db, groups: db.groups.filter((g) => g.id !== groupId) });
  }

  async function updateGroupBrowser(groupId: string, browser: Browser) {
    const nextGroups = db.groups.map((g) => {
      if (g.id !== groupId) return g;
      return { ...g, browser };
    });
    await setDB({ ...db, groups: nextGroups });
  }

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

        const browserLabel =
          BROWSER_OPTIONS.find((b) => b.value === group.browser)?.title ||
          "System Default";

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
                      group.links.map((l) => l.url),
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

function AddGroupForm(props: {
  onCreate: (title: string, browser: Browser) => Promise<void>;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Group"
            onSubmit={async (values) => {
              const title = String(values.title ?? "").trim();
              if (!title) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Group name is required",
                });
                return;
              }
              await props.onCreate(title, (values.browser as Browser) || "");
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Group Name"
        placeholder="e.g. Morning Tabs"
        autoFocus
      />
      <Form.Dropdown id="browser" title="Browser" defaultValue="">
        {BROWSER_OPTIONS.map((option) => (
          <Form.Dropdown.Item
            key={option.value}
            value={option.value}
            title={option.title}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}

function ChangeBrowserForm(props: {
  currentBrowser: Browser;
  onSubmit: (browser: Browser) => Promise<void>;
}) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Browser"
            onSubmit={async (values) => {
              await props.onSubmit((values.browser as Browser) || "");
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="browser"
        title="Browser"
        defaultValue={props.currentBrowser}
      >
        {BROWSER_OPTIONS.map((option) => (
          <Form.Dropdown.Item
            key={option.value}
            value={option.value}
            title={option.title}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
