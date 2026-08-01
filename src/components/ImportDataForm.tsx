import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { readFile } from "fs/promises";

import type { ImportMode, MergeResult } from "../lib/data-transfer";
import { parseImportedDB } from "../lib/storage";
import type { LinkDB } from "../lib/types";

type Values = { file: string[]; mode: ImportMode };

type Props = {
  onImport: (db: LinkDB, mode: ImportMode) => Promise<MergeResult>;
};

export default function ImportDataForm({ onImport }: Props) {
  const { pop } = useNavigation();

  async function handleSubmit(values: Values) {
    const filePath = values.file[0];
    if (!filePath) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Choose a backup file",
      });
      return;
    }

    try {
      const imported = parseImportedDB(await readFile(filePath, "utf8"));

      if (values.mode === "replace") {
        const confirmed = await confirmAlert({
          title: "Replace all current data?",
          message: `This will replace the current data with ${imported.groups.length} imported group${imported.groups.length === 1 ? "" : "s"}. A local backup is created first.`,
          primaryAction: {
            title: "Replace Data",
            style: Alert.ActionStyle.Destructive,
          },
        });
        if (!confirmed) return;
      }

      const result = await onImport(imported, values.mode);
      await showToast({
        style: Toast.Style.Success,
        title: values.mode === "replace" ? "Data replaced" : "Data merged",
        message:
          values.mode === "replace"
            ? `${imported.groups.length} group${imported.groups.length === 1 ? "" : "s"} imported.`
            : `${result.groupsAdded} groups and ${result.linksAdded} links added.`,
      });
      pop();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to import data",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Form
      navigationTitle="Import Data"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import Data"
            icon={Icon.Download}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="file"
        title="Backup File"
        canChooseDirectories={false}
        allowMultipleSelection={false}
      />
      <Form.Dropdown id="mode" title="Import Mode" defaultValue="merge">
        <Form.Dropdown.Item
          value="merge"
          title="Merge with Current Data"
          icon={Icon.PlusCircle}
        />
        <Form.Dropdown.Item
          value="replace"
          title="Replace Current Data"
          icon={Icon.RotateClockwise}
        />
      </Form.Dropdown>
      <Form.Description text="Merge matches groups by title and skips links whose URL already exists in that group." />
    </Form>
  );
}
