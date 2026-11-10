import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";

test("offline reconciliation preserves import ordering and independent remote ordering", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "link-groups-transfer-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "transfer.cjs");
  await build({
    entryPoints: [resolve("src/lib/data-transfer.ts")],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  const { mergeLinkDB, reconcileOfflineDB } = createRequire(import.meta.url)(
    output,
  );
  const link = (id) => ({ id, title: id, url: `https://example.com/${id}` });
  const group = (id, ...ids) => ({
    id,
    title: id,
    browser: "",
    links: ids.map(link),
  });
  const db = (...groups) => ({ version: 1, groups });
  const baseline = db(group("first", "a", "b"), group("second"));
  const imported = mergeLinkDB(
    baseline,
    db(group("first", "c"), group("third")),
  ).db;
  assert.deepEqual(reconcileOfflineDB(baseline, imported, baseline), imported);
  const reordered = db(group("second"), group("first", "c", "b", "a"));
  assert.deepEqual(
    reconcileOfflineDB(baseline, reordered, baseline),
    reordered,
  );
  const remoteOrder = db(group("second"), group("first", "b", "a"));
  assert.deepEqual(
    reconcileOfflineDB(baseline, baseline, remoteOrder),
    remoteOrder,
  );
  const remoteAddition = db(
    group("first", "remote", "a", "b"),
    group("second"),
  );
  assert.deepEqual(
    reconcileOfflineDB(baseline, imported, remoteAddition),
    db(
      group("first", "remote", "a", "b", "c"),
      group("second"),
      group("third"),
    ),
  );
  const restored = group("restored", "original");
  const localRestore = group("restored", "offline", "original");
  assert.deepEqual(
    reconcileOfflineDB(db(), db(localRestore), db(restored)),
    db(localRestore),
  );
});
