import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";

import type { Browser } from "../lib/types";
import { BROWSER_OPTIONS } from "../lib/types";

type ChangeBrowserFormProps = {
  currentBrowser: Browser;
  onSubmit: (browser: Browser) => Promise<boolean>;
};

export default function ChangeBrowserForm({
  currentBrowser,
  onSubmit,
}: ChangeBrowserFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Browser"
            onSubmit={async (values) => {
              const success = await onSubmit(values.browser);
              if (success) {
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="browser" title="Browser" defaultValue={currentBrowser}>
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
