import { LaunchProps, showToast, Toast } from "@raycast/api";
import { readDB } from "./lib/storage";
import { openAllUrls } from "./lib/openAll";

interface Arguments {
  groupId: string;
}

export default async function OpenLinkGroupCommand(
  props: LaunchProps<{ arguments: Arguments }>,
) {
  const { groupId } = props.arguments;

  const db = await readDB();
  const group = db.groups.find((g) => g.id === groupId);

  if (!group) {
    await showToast({ style: Toast.Style.Failure, title: "Group not found" });
    return;
  }

  await openAllUrls(
    group.links.map((l) => l.url),
    group.browser,
  );
}
