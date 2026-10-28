import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const group = (id) => ({ id, title: id, browser: "", links: [] });
const db = (...groups) => ({ version: 1, groups });

async function mac(t, root, name, initial) {
  const supportPath = join(root, name);
  mkdirSync(supportPath);
  writeFileSync(join(supportPath, "sync-config.json"), "{}");
  const values = new Map([["link-groups-db", JSON.stringify(initial)]]);
  const toasts = [];
  const intervals = new Set();
  const cleanups = [];
  const key = "linkGroupsTest" + name;
  globalThis[key] = {
    environment: { supportPath },
    LocalStorage: {
      getItem: async (key) => values.get(key),
      setItem: async (key, value) => {
        values.set(key, value);
      },
    },
    Toast: { Style: { Failure: "failure" } },
    showToast: async (toast) => {
      toasts.push(toast);
    },
    useEffect: (effect) => {
      cleanups.push(effect());
    },
    useState: (initial) => [initial, () => {}],
    setInterval: (callback) => {
      intervals.add(callback);
      return callback;
    },
    clearInterval: (callback) => {
      intervals.delete(callback);
    },
  };
  t.after(() => {
    cleanups.forEach((cleanup) => cleanup());
    delete globalThis[key];
  });
  const output = join(root, name + ".cjs");
  await build({
    entryPoints: [resolve("src/lib/storage.ts")],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    define: {
      setInterval: `globalThis.${key}.setInterval`,
      clearInterval: `globalThis.${key}.clearInterval`,
    },
    plugins: [
      {
        name: "isolated-mac-environment",
        setup(build) {
          build.onResolve({ filter: /^@raycast\/api$/ }, () => ({
            path: "raycast",
            namespace: "test",
          }));
          build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents: `const mock = globalThis[${JSON.stringify(key)}]; export const {environment, LocalStorage, Toast, showToast} = mock;`,
          }));
          build.onResolve({ filter: /^react$/ }, () => ({
            path: "react",
            namespace: "test-react",
          }));
          build.onLoad({ filter: /.*/, namespace: "test-react" }, () => ({
            contents: `export const {useEffect, useState} = globalThis[${JSON.stringify(key)}];`,
          }));
          build.onLoad({ filter: /sync-server\.ts$/ }, (args) => ({
            contents: readFileSync(args.path, "utf8")
              .replace(
                'Path.home() / "Library/Application Support/Link Groups Sync"',
                `Path(${JSON.stringify(join(root, "shared"))})`,
              )
              .replace(
                "request = json.load(sys.stdin)",
                'with (root / "requests.log").open("a") as requests:\n    requests.write("request\\n")\nrequest = json.load(sys.stdin)',
              ),
            loader: "ts",
          }));
        },
      },
    ],
  });
  return { ...require(output), values, toasts, supportPath, intervals };
}

function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "link-groups-storage-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("the storage adapter synchronizes groups, links, concurrent edits and deletions in both directions", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "book", db(group("book")));
  const mini = await mac(t, root, "mini", db(group("mini")));
  await book.readDB();
  assert.equal((await mini.readDB()).groups.length, 2);
  await Promise.all([
    book.updateDB((current) => db(...current.groups, group("book-added"))),
    mini.updateDB((current) => db(...current.groups, group("mini-added"))),
  ]);
  assert.deepEqual(await book.readDB(), await mini.readDB());
  const backupFiles = readdirSync(join(book.supportPath, "backups"));
  assert.ok(backupFiles.length > 1);
  const originalBackup = JSON.parse(
    readFileSync(
      join(
        book.supportPath,
        "backups",
        backupFiles.find((name) => name.startsWith("revision-0-")),
      ),
      "utf8",
    ),
  );
  assert.deepEqual(originalBackup, db(group("book")));
  const bookStatus = JSON.parse(
    readFileSync(join(book.supportPath, "sync-status.json"), "utf8"),
  );
  const miniStatus = JSON.parse(
    readFileSync(join(mini.supportPath, "sync-status.json"), "utf8"),
  );
  assert.equal(bookStatus.hash, miniStatus.hash);
  assert.equal(bookStatus.revision, miniStatus.revision);
  await mini.updateDB((current) =>
    db(
      ...current.groups.map((g) =>
        g.id === "book-added"
          ? {
              ...g,
              title: "Edited on mini",
              links: [
                { id: "link", title: "Example", url: "https://example.com/" },
              ],
            }
          : g,
      ),
    ),
  );
  const observed = (await book.readDB()).groups.find(
    (g) => g.id === "book-added",
  );
  assert.equal(observed.title, "Edited on mini");
  assert.equal(observed.links.length, 1);
  await book.updateDB((current) =>
    db(...current.groups.filter((g) => g.id !== "mini-added")),
  );
  assert.equal(
    (await mini.readDB()).groups.some((g) => g.id === "mini-added"),
    false,
  );
  assert.deepEqual(await book.readDB(), await mini.readDB());
  await book.writeDB(book.parseImportedDB(JSON.stringify(originalBackup)));
  assert.deepEqual(await mini.readDB(), originalBackup);
});

test("overlapping automatic refreshes share one request instead of accumulating", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "polling", db(group("keep")));
  book.useLinkDB();
  book.useLinkDB();
  assert.equal(book.intervals.size, 1);
  for (let tick = 0; tick < 20; tick++) {
    for (const callback of book.intervals) callback();
  }
  await book.readDB();
  const requests = readFileSync(join(root, "shared", "requests.log"), "utf8")
    .trim()
    .split("\n");
  assert.equal(requests.length, 2);
});

test("a failed transport preserves cached data, reports the outage and rejects edits", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "offline", db(group("keep")));
  await book.readDB();
  writeFileSync(
    join(book.supportPath, "sync-config.json"),
    JSON.stringify({
      sshHost: "unreachable.invalid",
      tailscalePath: "/nonexistent/link-groups-test",
    }),
  );
  assert.deepEqual(await book.readDB(), db(group("keep")));
  assert.equal(book.toasts.at(-1).title, "Group sync unavailable");
  await assert.rejects(
    book.updateDB(() => db()),
    /Unable to sync/,
  );
  assert.deepEqual(
    JSON.parse(book.values.get("link-groups-db")),
    db(group("keep")),
  );
  writeFileSync(join(book.supportPath, "sync-config.json"), "{}");
  assert.deepEqual(await book.readDB(), db(group("keep")));
  await book.updateDB((current) => db(...current.groups, group("reconnected")));
  assert.deepEqual(
    await book.readDB(),
    db(group("keep"), group("reconnected")),
  );
});

test("a corrupt shared database cannot erase the local cache", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "corruption", db(group("keep")));
  await book.readDB();
  writeFileSync(join(root, "shared", "database.json"), "broken");
  assert.deepEqual(await book.readDB(), db(group("keep")));
  await assert.rejects(book.updateDB(() => db()));
  assert.deepEqual(
    JSON.parse(book.values.get("link-groups-db")),
    db(group("keep")),
  );
});
