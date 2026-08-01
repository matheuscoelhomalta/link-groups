import { Action, ActionPanel, Icon } from "@raycast/api";

import type { ImportMode, MergeResult } from "../lib/data-transfer";
import type { LinkDB } from "../lib/types";
import ExportDataForm from "./ExportDataForm";
import ImportDataForm from "./ImportDataForm";

type Props = {
  db: LinkDB;
  onImport: (db: LinkDB, mode: ImportMode) => Promise<MergeResult>;
};

export default function DataTransferActions({ db, onImport }: Props) {
  return (
    <ActionPanel.Section title="Data">
      <Action.Push
        title="Import Data"
        icon={Icon.Download}
        shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
        target={<ImportDataForm onImport={onImport} />}
      />
      <Action.Push
        title="Export Data"
        icon={Icon.Upload}
        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
        target={<ExportDataForm db={db} />}
      />
    </ActionPanel.Section>
  );
}
