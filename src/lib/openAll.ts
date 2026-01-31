import { open, showToast, Toast } from "@raycast/api";
import type { Browser } from "./types";

export type OpenAllResult = {
  opened: number;
  failed: number;
  total: number;
};

/**
 * Opens all URLs simultaneously without validation
 * Shows a toast with success/failure count
 * @param urls - Array of URLs to open
 * @param browser - Optional browser bundle ID (empty string = system default)
 * @param silent - Optional silent mode to suppress toasts (default: false)
 * @returns Result with opened/failed/total counts
 */
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

  const openOptions = browser ? { application: browser } : undefined;
  const results = await Promise.allSettled(
    urls.map((u) => open(u, openOptions?.application)),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  const opened = urls.length - failed;

  if (!silent) {
    await showToast({
      style: failed > 0 ? Toast.Style.Failure : Toast.Style.Success,
      title: `Opened ${opened}/${urls.length} links`,
    });
  }

  return { opened, failed, total: urls.length };
}
