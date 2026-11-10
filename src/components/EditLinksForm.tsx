import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import type { LinkItem } from "../lib/types";
import { normalizeUrl, parseUrls } from "../lib/url-utils";

type EditLinksFormProps = {
  links: LinkItem[];
  onSave: (
    removeIds: string[],
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
              const originalUrls = new Set(links.map((link) => link.url));
              const keepCounts = new Map<string, number>();
              const addUrls: string[] = [];
              const invalid: string[] = [];

              for (const line of parseUrls(values.urls ?? "")) {
                // An untouched line keeps its stored link as is, even when
                // the stored URL is not in normalized form.
                const normalized = originalUrls.has(line)
                  ? line
                  : normalizeUrl(line);
                if (!normalized) {
                  invalid.push(line);
                } else if (originalUrls.has(normalized)) {
                  keepCounts.set(
                    normalized,
                    (keepCounts.get(normalized) ?? 0) + 1,
                  );
                } else {
                  addUrls.push(normalized);
                }
              }

              if (invalid.length > 0) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: `${invalid.length} invalid URL${invalid.length === 1 ? "" : "s"}`,
                  message: `Use valid http(s) URLs: ${invalid.join(", ")}`,
                });
                return;
              }

              // Only links shown in this form can be removed, so links added
              // elsewhere while it was open survive the save.
              const removeIds = links
                .filter((link) => {
                  const kept = keepCounts.get(link.url) ?? 0;
                  if (kept === 0) return true;
                  keepCounts.set(link.url, kept - 1);
                  return false;
                })
                .map((link) => link.id);

              const result = await onSave(removeIds, addUrls);

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
