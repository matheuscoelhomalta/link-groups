import { open, showToast, Toast } from "@raycast/api";
import type { Browser } from "./types";

/**
 * Opens all URLs simultaneously without validation
 * Shows a toast with success/failure count
 * @param urls - Array of URLs to open
 * @param browser - Optional browser bundle ID (empty string = system default)
 */
export async function openAllUrls(urls: string[], browser?: Browser) {
  if (urls.length === 0) {
    await showToast({ style: Toast.Style.Failure, title: "No links to open" });
    return;
  }

  const openOptions = browser ? { application: browser } : undefined;
  const results = await Promise.allSettled(
    urls.map((u) => open(u, openOptions?.application)),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  const opened = urls.length - failed;

  await showToast({
    style: failed > 0 ? Toast.Style.Failure : Toast.Style.Success,
    title: `Opened ${opened}/${urls.length} links`,
  });
}
