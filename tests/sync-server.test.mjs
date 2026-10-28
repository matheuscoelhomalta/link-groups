import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/lib/sync-server.ts", import.meta.url),
  "utf8",
);
const script = source.slice(
  source.indexOf("String.raw`") + 11,
  source.lastIndexOf("`"),
);
const group = (id, links = []) => ({ id, title: id, browser: "", links });
const link = (id) => ({ id, title: id, url: "https://example.com/" + id });
const db = (...groups) => ({ version: 1, groups });

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "link-groups-sync-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const isolated = script.replace(
    'Path.home() / "Library/Application Support/Link Groups Sync"',
    `Path(${JSON.stringify(directory)})`,
  );
  const request = (value) =>
    JSON.parse(
      execFileSync("/usr/bin/python3", ["-c", isolated], {
        input: JSON.stringify(value),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
  const concurrent = (value) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        "/usr/bin/python3",
        ["-c", isolated],
        (error, stdout) => {
          if (error) reject(error);
          else resolve(JSON.parse(stdout));
        },
      );
      child.stdin.end(JSON.stringify(value));
    });
  return { directory, request, concurrent };
}

test("joining two Macs preserves their groups and links without changing existing IDs", (t) => {
  const { request } = fixture(t);
  request({
    action: "join",
    db: db(group("shared", [link("a")]), group("mini")),
  });
  const state = request({
    action: "join",
    db: db(group("shared", [link("b")]), group("book")),
  });
  assert.deepEqual(
    state.db.groups.map((g) => g.id),
    ["shared", "mini", "book"],
  );
  assert.deepEqual(
    state.db.groups[0].links.map((l) => l.id),
    ["a", "b"],
  );
  assert.deepEqual(request({ action: "join", db: state.db }), state);
});

test("concurrent edits cannot silently overwrite each other", async (t) => {
  const { request, concurrent } = fixture(t);
  const initial = request({ action: "join", db: db(group("original")) });
  const responses = await Promise.all([
    concurrent({
      action: "write",
      revision: initial.revision,
      db: db(group("original"), group("book")),
    }),
    concurrent({
      action: "write",
      revision: initial.revision,
      db: db(group("original"), group("mini")),
    }),
  ]);
  assert.equal(responses.filter((r) => r.conflict).length, 1);
  const current = request({ action: "read" });
  const missing = current.db.groups.some((g) => g.id === "mini")
    ? "book"
    : "mini";
  const retried = request({
    action: "write",
    revision: current.revision,
    db: db(...current.db.groups, group(missing)),
  });
  assert.deepEqual(
    new Set(retried.db.groups.map((g) => g.id)),
    new Set(["original", "book", "mini"]),
  );
});

test("deletions persist on subsequent reads and the preceding data is backed up", (t) => {
  const { directory, request } = fixture(t);
  const initial = request({
    action: "join",
    db: db(group("keep"), group("remove")),
  });
  request({
    action: "write",
    revision: initial.revision,
    db: db(group("keep")),
  });
  assert.deepEqual(request({ action: "read" }).db, db(group("keep")));
  assert.deepEqual(
    JSON.parse(readFileSync(join(directory, "database-backup.json"), "utf8"))
      .db,
    initial.db,
  );
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(directory, "backups", "revision-0.json"), "utf8"),
    ),
    initial.db,
  );
  const current = request({ action: "read" });
  request({
    action: "write",
    revision: current.revision,
    db: db(group("keep"), group("new")),
  });
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(directory, "backups", "revision-0.json"), "utf8"),
    ),
    initial.db,
  );
});

test("invalid data and corrupt shared files fail without overwriting the database", (t) => {
  const { directory, request } = fixture(t);
  const initial = request({ action: "join", db: db(group("keep")) });
  assert.throws(() =>
    request({
      action: "write",
      revision: initial.revision,
      db: db(group("duplicate"), group("duplicate")),
    }),
  );
  assert.deepEqual(request({ action: "read" }), initial);
  writeFileSync(join(directory, "database.json"), "corrupted");
  assert.throws(() => request({ action: "read" }));
  assert.equal(
    readFileSync(join(directory, "database.json"), "utf8"),
    "corrupted",
  );
});
