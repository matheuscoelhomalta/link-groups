import { LaunchProps, showHUD } from "@raycast/api";
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
    await showHUD("Group not found");
    return;
  }

  if (group.links.length === 0) {
    await showHUD("Group is empty");
    return;
  }

  const result = await openAllUrls(
    group.links.map((l) => l.url),
    group.browser,
    true,
  );

  if (result.failed > 0) {
    await showHUD(`Opened ${result.opened}/${result.total} links`);
  } else {
    await showHUD(
      `Opened ${result.opened} link${result.opened === 1 ? "" : "s"}`,
    );
  }
}
