import {
  Action,
  ActionPanel,
  Form,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";

import { parseUrlsWithValidation } from "../lib/url-utils";

export type BulkImportResult = {
  added: number;
  failed: number;
};

type BulkImportFormProps = {
  onImport: (urls: string[]) => Promise<BulkImportResult>;
};

export default function BulkImportForm({ onImport }: BulkImportFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import Urls"
            onSubmit={async (values) => {
              const text = String(values.urls ?? "").trim();
              if (!text) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "No URLs provided",
                });
                return;
              }

              const { valid, invalid } = parseUrlsWithValidation(text);
              if (valid.length === 0) {
                await showToast({
                  style: Toast.Style.Failure,
                  title: "No valid URLs found",
                });
                return;
              }

              const result = await onImport(valid);
              if (result.added === 0) {
                return;
              }

              const details: string[] = [];
              if (invalid.length > 0) {
                details.push(
                  `Skipped ${invalid.length} invalid URL${invalid.length === 1 ? "" : "s"}.`,
                );
              }
              if (result.failed > 0) {
                details.push(
                  `Failed to import ${result.failed} URL${result.failed === 1 ? "" : "s"}.`,
                );
              }

              await showToast({
                style: Toast.Style.Success,
                title: `Imported ${result.added} links`,
                message: details.length > 0 ? details.join(" ") : undefined,
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
