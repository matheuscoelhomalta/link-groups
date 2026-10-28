import {
  Action,
  ActionPanel,
  Form,
  getApplications,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { writeFile } from "fs/promises";
import path from "path";

import { convertToPinsExport } from "../lib/pins-export";
import type { LinkDB } from "../lib/types";

type ExportFormat = "backup" | "pins";
type Values = { destination: string[]; format: ExportFormat };

function exportFilename(format: ExportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = format === "pins" ? "pins-import" : "link-groups-backup";
  return `${prefix}-${timestamp}.json`;
}

export default function ExportDataForm({ db }: { db: LinkDB }) {
  const { pop } = useNavigation();

  async function handleSubmit(values: Values) {
    const directory = values.destination[0];
    if (!directory) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Choose a destination folder",
      });
      return;
    }

    try {
      const data =
        values.format === "pins"
          ? convertToPinsExport(
              db,
              Object.fromEntries(
                (await getApplications())
                  .filter((application) => application.bundleId)
                  .map((application) => [
                    application.bundleId,
                    application.path,
                  ]),
              ),
            )
          : db;
      const filePath = path.join(directory, exportFilename(values.format));
      await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await showToast({
        style: Toast.Style.Success,
        title: "Data exported",
        message: filePath,
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to export data",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Form
      navigationTitle="Export Data"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Export Data"
            icon={Icon.Upload}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Export a Link Groups backup or JSON that can be imported directly by the Pins extension." />
      <Form.Dropdown id="format" title="Format" defaultValue="backup">
        <Form.Dropdown.Item
          value="backup"
          title="Link Groups Backup"
          icon={Icon.Archive}
        />
        <Form.Dropdown.Item
          value="pins"
          title="Pins Import JSON"
          icon={Icon.Pin}
        />
      </Form.Dropdown>
      <Form.FilePicker
        id="destination"
        title="Destination"
        canChooseFiles={false}
        canChooseDirectories
        allowMultipleSelection={false}
      />
    </Form>
  );
}
