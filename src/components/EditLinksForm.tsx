import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import type { LinkItem } from "../lib/types";
import { normalizeUrl } from "../lib/url-utils";

type EditLinksFormProps = {
  links: LinkItem[];
  onSave: (
    keepUrls: string[],
    addUrls: string[],
  ) => Promise<{ removed: number; added: number }>;
};

export default function EditLinksForm({ links, onSave }: EditLinksFormProps) {
  const { pop } = useNavigation();

  const initialText = links.map((link) => link.url).join("\n");

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            onSubmit={async (values) => {
              const text = (values.urls ?? "").trim();

              const newUrls = text
                .split("\n")
                .map((line: string) => line.trim())
                .filter(Boolean)
                .map((url: string) => normalizeUrl(url))
                .filter((url: string | null): url is string => url !== null);

              const originalUrls = new Set(links.map((link) => link.url));
              const keepUrls = newUrls.filter((url: string) =>
                originalUrls.has(url),
              );
              const addUrls = newUrls.filter(
                (url: string) => !originalUrls.has(url),
              );

              const result = await onSave(keepUrls, addUrls);

              if (result.removed === 0 && result.added === 0) {
                await showToast({
                  style: Toast.Style.Success,
                  title: "No changes made",
                });
                pop();
                return;
              }

              const messages: string[] = [];
              if (result.removed > 0) {
                messages.push(
                  `Removed ${result.removed} link${result.removed === 1 ? "" : "s"}`,
                );
              }
              if (result.added > 0) {
                messages.push(
                  `Added ${result.added} link${result.added === 1 ? "" : "s"}`,
                );
              }

              await showToast({
                style: Toast.Style.Success,
                title: messages.join(", "),
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
        defaultValue={initialText}
        placeholder="One URL per line…"
        autoFocus
      />
      <Form.Description text="Remove lines to delete links. Add new lines to add links. Titles are auto-generated for new URLs." />
    </Form>
  );
}
