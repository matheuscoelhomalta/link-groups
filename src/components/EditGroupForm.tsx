import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import type { Browser, LinkGroup } from "../lib/types";
import { BROWSER_OPTIONS } from "../lib/types";

type EditGroupFormProps = {
  group: LinkGroup;
  onUpdate: (
    groupId: string,
    title: string,
    browser: Browser,
  ) => Promise<boolean>;
};

export default function EditGroupForm({ group, onUpdate }: EditGroupFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            onSubmit={async (values) => {
              const title = (values.title ?? "").trim();
              if (!title) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "Group name is required",
                });
                return;
              }
              const success = await onUpdate(group.id, title, values.browser);
              if (success) {
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Group Name"
        placeholder="e.g. Morning Tabs"
        defaultValue={group.title}
        autoFocus
      />
      <Form.Dropdown
        id="browser"
        title="Browser"
        defaultValue={group.browser || ""}
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
