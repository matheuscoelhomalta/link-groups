import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";

test("bulk edit removes snapshot IDs and preserves links across concurrent deletions and retries", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "link-groups-edit-test-"));
  const link = (id, url = "https://example.com") => ({ id, title: id, url });
  const original = [link("a"), link("b")];
  let current = {
    version: 1,
    groups: [{ id: "group", title: "Group", links: original }],
  };
  let retry;
  let submissions = [];
  let pops = 0;
  const toasts = [];
  globalThis.linkGroupsEditTest = {
    Action: { SubmitForm: "submit" },
    ActionPanel: "actions",
    Form: Object.assign(() => {}, {
      TextArea: "text",
      Description: "description",
    }),
    Toast: { Style: { Failure: "failure", Success: "success" } },
    showToast: async (toast) => toasts.push(toast),
    useNavigation: () => ({ pop: () => pops++ }),
    useLinkDB: () => ({
      db: current,
      isLoading: false,
      updateDB: async (updater) => {
        if (retry) {
          updater(current);
          current = retry;
          retry = undefined;
        }
        current = updater(current);
      },
    }),
  };
  t.after(() => {
    delete globalThis.linkGroupsEditTest;
    rmSync(directory, { recursive: true, force: true });
  });
  await build({
    entryPoints: {
      form: resolve("src/components/EditLinksForm.tsx"),
      actions: resolve("src/hooks/useLinkGroupActions.ts"),
    },
    outdir: directory,
    outExtension: { ".js": ".cjs" },
    bundle: true,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "mock-raycast-storage",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^@raycast\/api$|^react\/jsx-runtime$|^\.\.\/lib\/storage$/,
            },
            (args) => ({ path: args.path, namespace: "test" }),
          );
          build.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
            contents:
              args.path === "react/jsx-runtime"
                ? "export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx;"
                : "export const {Action, ActionPanel, Form, Toast, showToast, useNavigation, useLinkDB, Alert, confirmAlert} = globalThis.linkGroupsEditTest;",
          }));
        },
      },
    ],
  });
  const require = createRequire(import.meta.url);
  const { default: Form } = require(join(directory, "form.cjs"));
  const { useLinkGroupActions } = require(join(directory, "actions.cjs"));
  const actions = useLinkGroupActions();
  const form = Form({
    links: original,
    onSave: async (...args) => {
      submissions.push(args);
      return actions.editLinks("group", ...args);
    },
  });
  const submit = form.props.actions.props.children.props.onSubmit;
  // Another Mac has already removed B and added a new link with the same URL.
  current.groups[0].links = [link("concurrent"), link("a")];
  await submit({ urls: "https://example.com" });
  assert.deepEqual(submissions, [[["b"], []]]);
  assert.deepEqual(
    current.groups[0].links.map((l) => l.id),
    ["concurrent", "a"],
  );
  assert.equal(pops, 1);
  assert.equal(toasts.at(-1).title, "No changes made");
  // A revision conflict removes B before the updater runs a second time.
  current.groups[0].links = original;
  retry = {
    ...current,
    groups: [{ ...current.groups[0], links: [link("a")] }],
  };
  assert.deepEqual(await actions.editLinks("group", ["b"], []), {
    removed: 0,
    added: 0,
  });
  assert.deepEqual(
    current.groups[0].links.map((l) => l.id),
    ["a"],
  );
  await submit({ urls: "https://example.com\ninvalid" });
  assert.equal(submissions.length, 1);
  assert.equal(pops, 1);
  assert.equal(toasts.at(-1).style, "failure");
});
