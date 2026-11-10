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

async function mac(t, root, name, initial, options = {}) {
  const supportPath = join(root, options.supportName ?? name);
  mkdirSync(supportPath, { recursive: true });
  writeFileSync(join(supportPath, "sync-config.json"), "{}");
  const values =
    options.values ?? new Map([["link-groups-db", JSON.stringify(initial)]]);
  const transport = {};
  const toasts = [];
  const intervals = new Set();
  const cleanups = [];
  const key = "linkGroupsTest" + name;
  globalThis[key] = {
    transport,
    environment: { supportPath },
    LocalStorage: {
      getItem: async (key) => values.get(key),
      setItem: async (key, value) => {
        values.set(key, value);
      },
      removeItem: async (key) => {
        values.delete(key);
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
              )
              .replace(
                "\n    print(json.dumps(state))\n",
                '\n    if request.get("reconciliation") and (root / "lose-response").exists():\n        (root / "lose-response").unlink()\n        sys.exit("simulated lost response")\n    print(json.dumps(state))\n',
              ),
            loader: "ts",
          }));
          build.onLoad({ filter: /\/sync\.ts$/ }, (args) => ({
            contents: readFileSync(args.path, "utf8")
              .replace(
                "export function requestSync(",
                "export async function requestSync(",
              )
              .replace(
                "  const command = config.sshHost",
                `  await globalThis[${JSON.stringify(key)}].transport.beforeSync?.(request);\n  const command = config.sshHost`,
              ),
            loader: "ts",
          }));
        },
      },
    ],
  });
  return {
    ...require(output),
    values,
    toasts,
    supportPath,
    intervals,
    transport,
  };
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
  await book.updateDB(() =>
    book.parseImportedDB(JSON.stringify(originalBackup)),
  );
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
  assert.match(book.toasts.at(-1).message, /shared database is damaged/);
  assert.doesNotMatch(book.toasts.at(-1).message, /Traceback/);
  await assert.rejects(book.updateDB(() => db()));
  assert.deepEqual(
    JSON.parse(book.values.get("link-groups-db")),
    db(group("keep")),
  );
});

test("edits made while sync is switched off are merged when it is restored", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "book", db(group("shared")));
  const mini = await mac(t, root, "mini", db(group("shared")));
  await book.readDB();
  await mini.readDB();
  const config = join(book.supportPath, "sync-config.json");
  rmSync(config);
  await book.updateDB((current) => db(...current.groups, group("offline")));
  await mini.updateDB((current) => db(...current.groups, group("remote")));
  writeFileSync(config, "{}");
  assert.deepEqual((await book.readDB()).groups.map((g) => g.id).sort(), [
    "offline",
    "remote",
    "shared",
  ]);
  assert.deepEqual(await mini.readDB(), await book.readDB());
});

test("an unreadable sync configuration is reported by name", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "config", db(group("keep")));
  writeFileSync(join(book.supportPath, "sync-config.json"), "{not json");
  assert.deepEqual(await book.readDB(), db(group("keep")));
  assert.match(
    book.toasts.at(-1).message,
    /Invalid Link Groups sync configuration/,
  );
});

test("equivalent transport settings preserve pending offline edits", async (t) => {
  const root = directory(t);
  const initial = db(group("keep"), group("remove"));
  const book = await mac(t, root, "book", initial);
  const mini = await mac(t, root, "mini", initial);
  await book.readDB();
  await mini.readDB();
  const config = join(book.supportPath, "sync-config.json");
  rmSync(config);
  await book.updateDB(() => db({ ...group("keep"), title: "Offline title" }));
  await mini.updateDB((current) => db(group("remote"), ...current.groups));
  writeFileSync(
    config,
    JSON.stringify({ tailscalePath: "/usr/local/bin/tailscale" }),
  );
  const expected = db(group("remote"), {
    ...group("keep"),
    title: "Offline title",
  });
  assert.deepEqual(await book.readDB(), expected);
  assert.deepEqual(await mini.readDB(), expected);
});

test("changing the sync target archives pending edits before joining", async (t) => {
  const root = directory(t);
  const initial = db(group("keep"), group("remove"));
  const book = await mac(t, root, "book", initial);
  await book.readDB();
  const config = join(book.supportPath, "sync-config.json");
  rmSync(config);
  const cached = db({ ...group("keep"), title: "Offline title" });
  await book.updateDB(() => cached);
  // Model an installation previously joined to an SSH target, now using local sync.
  book.values.set(
    "link-groups-sync-joined",
    JSON.stringify({ sshHost: "previous-sync-mac" }),
  );
  writeFileSync(config, "{}");
  assert.deepEqual(await book.readDB(), initial);
  assert.equal(book.toasts.at(-1).title, "Sync target changed");
  const backup = readdirSync(join(book.supportPath, "backups")).find((name) =>
    name.startsWith("offline-recovery-"),
  );
  assert.ok(backup);
  assert.deepEqual(
    book.parseImportedDB(
      readFileSync(join(book.supportPath, "backups", backup), "utf8"),
    ),
    cached,
  );
});

test("restoring sync applies offline edits without resurrecting remote deletions", async (t) => {
  const root = directory(t);
  const link = (id) => ({ id, title: id, url: `https://example.com/${id}` });
  const initial = db(
    {
      ...group("keep"),
      links: [link("local-delete"), link("remote-delete"), link("keep")],
    },
    group("remote-delete"),
    group("local-delete"),
    group("remote-edit"),
  );
  const book = await mac(t, root, "book", initial);
  const mini = await mac(t, root, "mini", initial);
  await book.readDB();
  await mini.readDB();
  const config = join(book.supportPath, "sync-config.json");
  rmSync(config);
  await book.updateDB((current) =>
    db(...current.groups.filter((g) => g.id !== "local-delete")),
  );
  await book.updateDB((current) =>
    db(
      group("offline"),
      ...current.groups.map((g) =>
        g.id === "keep"
          ? {
              ...g,
              title: "Offline title",
              links: [
                link("offline"),
                ...g.links.filter((l) => l.id !== "local-delete"),
              ],
            }
          : g,
      ),
    ),
  );
  await mini.updateDB((current) =>
    db(
      group("remote"),
      ...current.groups
        .filter((g) => g.id !== "remote-delete")
        .map((g) =>
          g.id === "keep"
            ? {
                ...g,
                browser: "com.apple.Safari",
                links: [
                  link("remote"),
                  ...g.links.filter((l) => l.id !== "remote-delete"),
                ],
              }
            : g.id === "remote-edit"
              ? { ...g, title: "Remote title" }
              : g,
        ),
    ),
  );
  const expected = db(
    group("remote"),
    group("offline"),
    {
      ...group("keep"),
      title: "Offline title",
      browser: "com.apple.Safari",
      links: [link("remote"), link("offline"), link("keep")],
    },
    { ...group("remote-edit"), title: "Remote title" },
  );
  writeFileSync(config, "{}");
  // An unsuccessful reconnection must leave the pending offline changes intact.
  const sharedFile = join(root, "shared", "database.json");
  const shared = readFileSync(sharedFile, "utf8");
  writeFileSync(sharedFile, "broken");
  assert.ok((await book.readDB()).groups.some((g) => g.id === "offline"));
  writeFileSync(sharedFile, shared);
  assert.deepEqual(await book.readDB(), expected);
  const receivedBackup = readdirSync(join(book.supportPath, "backups")).find(
    (name) => name.startsWith(`revision-${JSON.parse(shared).revision}-`),
  );
  assert.ok(receivedBackup);
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(book.supportPath, "backups", receivedBackup), "utf8"),
    ),
    JSON.parse(shared).db,
  );
  assert.deepEqual(await mini.readDB(), expected);
  await mini.updateDB((current) =>
    db(...current.groups.filter((g) => g.id !== "offline")),
  );
  assert.ok(!(await book.readDB()).groups.some((g) => g.id === "offline"));
});

test("cache corruption cannot publish automatic recovery as shared deletions", async (t) => {
  for (const damage of ["both", "backup", "partial", "missing"]) {
    await t.test(damage, async (t) => {
      const root = directory(t);
      const initial = db(group("keep"), group("also-keep"));
      const book = await mac(t, root, "book", initial);
      await book.readDB();
      const config = join(book.supportPath, "sync-config.json");
      rmSync(config);
      await book.updateDB((current) => db(...current.groups, group("offline")));
      book.values.set("link-groups-db", "broken");
      if (damage === "both") book.values.set("link-groups-db-backup", "broken");
      if (damage === "partial")
        book.values.set(
          "link-groups-db",
          JSON.stringify(db({ id: "keep", links: [] })),
        );
      if (damage === "missing") book.values.delete("link-groups-db");
      writeFileSync(config, "{}");
      assert.deepEqual(await book.readDB(), initial);
      assert.deepEqual(
        JSON.parse(readFileSync(join(root, "shared", "database.json"), "utf8"))
          .db,
        initial,
      );
    });
  }
});

test("a lost reconciliation response cannot replay acknowledged edits over later remote changes", async (t) => {
  const root = directory(t);
  const book = await mac(t, root, "book", db(group("keep")));
  const mini = await mac(t, root, "mini", db(group("keep")));
  await book.readDB();
  await mini.readDB();
  const config = join(book.supportPath, "sync-config.json");
  rmSync(config);
  await book.updateDB((current) => db(group("offline"), ...current.groups));
  writeFileSync(config, "{}");
  writeFileSync(join(root, "shared", "lose-response"), "");
  const cached = await book.readDB();
  assert.match(book.toasts.at(-1).message, /simulated lost response/);
  assert.deepEqual(
    (await mini.readDB()).groups.map((g) => g.id),
    ["offline", "keep"],
  );
  await mini.updateDB(() => db({ ...group("keep"), title: "Remote title" }));
  // More local work after the unknown outcome must be sent as a new operation.
  rmSync(config);
  await book.updateDB(() => db(group("later"), ...cached.groups));
  writeFileSync(config, "{}");
  const expected = db(group("later"), {
    ...group("keep"),
    title: "Remote title",
  });
  assert.deepEqual(await book.readDB(), expected);
  assert.deepEqual(await mini.readDB(), expected);
});

test("corrupt offline metadata is archived and cannot block sync or recovery imports", async (t) => {
  for (const damage of ["{broken", "null", '{"db":{},"reconciliation":{}}']) {
    await t.test(damage, async (t) => {
      const root = directory(t);
      const initial = db(group("keep"));
      const book = await mac(t, root, "book", initial);
      await book.readDB();
      const config = join(book.supportPath, "sync-config.json");
      rmSync(config);
      const cached = db(group("offline"), group("keep"));
      await book.updateDB(() => cached);
      book.values.set("link-groups-sync-offline-base", damage);
      writeFileSync(config, "{}");
      assert.deepEqual(await book.readDB(), initial);
      const backup = readdirSync(join(book.supportPath, "backups")).find(
        (name) => name.startsWith("offline-recovery-"),
      );
      assert.ok(backup);
      const recovered = book.parseImportedDB(
        readFileSync(join(book.supportPath, "backups", backup), "utf8"),
      );
      assert.deepEqual(recovered, cached);
      assert.equal(book.toasts.at(-1).title, "Offline sync state recovered");
      await book.updateDB(() => recovered);
      assert.deepEqual(await book.readDB(), cached);
    });
  }
});

test(
  "overlapping command runtimes serialize offline snapshots and release the lock after failures",
  { timeout: 10000 },
  async (t) => {
    const root = directory(t);
    const book = await mac(t, root, "book", db(group("keep")));
    const mini = await mac(t, root, "mini", db(group("keep")));
    await book.readDB();
    await mini.readDB();
    const config = join(book.supportPath, "sync-config.json");
    rmSync(config);
    await book.updateDB(() => db({ ...group("keep"), title: "offline-1" }));
    writeFileSync(config, "{}");
    writeFileSync(join(root, "shared", "lose-response"), "");
    await book.readDB();
    assert.match(book.toasts.at(-1).message, /simulated lost response/);
    rmSync(config);
    await book.updateDB(() => db({ ...group("keep"), title: "offline-2" }));
    writeFileSync(config, "{}");
    const quicklink = await mac(t, root, "quicklink", db(), {
      supportName: "book",
      values: book.values,
    });
    let release, started;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const reached = new Promise((resolve) => {
      started = resolve;
    });
    t.after(() => release());
    let first = true;
    book.transport.beforeSync = async (request) => {
      if (request.reconciliation && first) {
        first = false;
        started();
        await held;
      }
    };
    const delayed = book.readDB();
    await reached;
    let quicklinkRequests = 0;
    quicklink.transport.beforeSync = () => {
      quicklinkRequests++;
    };
    const waiting = quicklink.readDB();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(quicklinkRequests, 0);
    release();
    assert.equal((await delayed).groups[0].title, "offline-2");
    assert.equal((await waiting).groups[0].title, "offline-2");
    await mini.updateDB(() => db({ ...group("keep"), title: "remote-3" }));
    assert.equal((await book.readDB()).groups[0].title, "remote-3");
    assert.equal((await mini.readDB()).groups[0].title, "remote-3");
    await assert.rejects(
      book.updateDB(() => {
        throw new Error("updater failed");
      }),
      /updater failed/,
    );
    assert.equal((await quicklink.readDB()).groups[0].title, "remote-3");
  },
);
