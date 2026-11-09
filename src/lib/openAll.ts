import { open, showToast, Toast } from "@raycast/api";
import type { Browser } from "./types";

export type OpenAllResult = {
  opened: number;
  failed: number;
  total: number;
};

export async function openAllUrls(
  urls: string[],
  browser?: Browser,
  silent = false,
): Promise<OpenAllResult> {
  if (urls.length === 0) {
    if (!silent) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No links to open",
      });
    }
    return { opened: 0, failed: 0, total: 0 };
  }

  let failed = 0;
  for (const url of urls) {
    try {
      await open(url, browser || undefined);
    } catch {
      failed += 1;
    }
  }
  const opened = urls.length - failed;

  if (!silent) {
    await showToast({
      style: failed > 0 ? Toast.Style.Failure : Toast.Style.Success,
      title: `Opened ${opened}/${urls.length} links`,
    });
  }

  return { opened, failed, total: urls.length };
}
