import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";

test("links open in saved order, awaiting each attempt and continuing after failure", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "link-groups-open-test-"));
  const attempts = [];
  const pending = [];
  const toasts = [];
  globalThis.linkGroupsOpenTest = {
    open: (url, browser) => {
      attempts.push({ url, browser });
      return new Promise((resolve, reject) =>
        pending.push({ resolve, reject }),
      );
    },
    showToast: async (toast) => toasts.push(toast),
    Toast: { Style: { Failure: "failure", Success: "success" } },
  };
  t.after(() => {
    delete globalThis.linkGroupsOpenTest;
    rmSync(directory, { recursive: true, force: true });
  });
  const output = join(directory, "open-all.cjs");
  await build({
    entryPoints: [resolve("src/lib/openAll.ts")],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "mock-raycast",
        setup(build) {
          build.onResolve({ filter: /^@raycast\/api$/ }, () => ({
            path: "raycast",
            namespace: "test",
          }));
          build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents:
              "export const {open, showToast, Toast} = globalThis.linkGroupsOpenTest;",
          }));
        },
      },
    ],
  });
  const { openAllUrls } = createRequire(import.meta.url)(output);
  const urls = [
    "https://example.com/1",
    "https://example.com/2",
    "https://example.com/3",
  ];
  const result = openAllUrls(urls, "com.apple.Safari");
  assert.deepEqual(
    attempts.map((a) => a.url),
    urls.slice(0, 1),
  );
  pending[0].resolve();
  await Promise.resolve();
  assert.deepEqual(
    attempts.map((a) => a.url),
    urls.slice(0, 2),
  );
  pending[1].reject(new Error("Unable to open"));
  await Promise.resolve();
  assert.deepEqual(
    attempts.map((a) => a.url),
    urls,
  );
  assert.ok(attempts.every((a) => a.browser === "com.apple.Safari"));
  pending[2].resolve();
  assert.deepEqual(await result, { opened: 2, failed: 1, total: 3 });
  assert.deepEqual(toasts, [{ style: "failure", title: "Opened 2/3 links" }]);
});
