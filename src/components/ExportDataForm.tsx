import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { writeFile } from "fs/promises";
import path from "path";

import type { LinkDB } from "../lib/types";

type Values = { destination: string[] };

function backupFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `link-groups-backup-${timestamp}.json`;
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
      const filePath = path.join(directory, backupFilename());
      await writeFile(filePath, `${JSON.stringify(db, null, 2)}\n`, {
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
      <Form.Description text="Exports every group, link, browser preference, and ID to a JSON backup." />
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
