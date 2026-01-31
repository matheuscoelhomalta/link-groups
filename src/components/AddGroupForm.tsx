import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import type { Browser } from "../lib/types";
import { BROWSER_OPTIONS } from "../lib/types";

type AddGroupFormProps = {
  onCreate: (title: string, browser: Browser) => Promise<unknown | null>;
};

export default function AddGroupForm({ onCreate }: AddGroupFormProps) {
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
              const result = await onCreate(
                title,
                (values.browser as Browser) || "",
              );
              if (result !== null) {
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
