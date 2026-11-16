// mycelia (NOR-389): the MCP Inspector's `scripts/verify-coverage-scope.test.mjs`
// (modelcontextprotocol/inspector at commit d330df9617e44ec893bc1a53618662239342d433, blob
// 4f4f97e528e88b1472fb44d35e6abd4552b4060c), adapted with the guard: the client
// roster tests are removed with the roster, and the inventory cases are added.
// Record: PROVENANCE-CHECK.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  diffCoverageScope,
  expandCoverageScope,
  run,
} from "./verify-coverage-scope.mjs";

const slash = (p) => p.split(path.sep).join("/");

/**
 * A throwaway repo holding the given files (repo-relative), each with a stub
 * body. realpath'd because macOS `tmpdir()` is a symlink and the guard
 * compares resolved paths.
 *
 * @param {string[]} files
 */
function makeRepo(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "cov-scope-")));
  for (const f of files) {
    const abs = path.join(root, f);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "export {};\n");
  }
  return root;
}

const abs = (root, ...rel) => rel.map((r) => slash(path.join(root, r)));

test("a relative include resolves against the client directory", (t) => {
  const root = makeRepo([
    "clients/web/src/components/A.tsx",
    "clients/web/src/components/b/B.ts",
    "src/components/NotThisOne.tsx",
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = expandCoverageScope({
    include: ["src/components/**/*.{ts,tsx}"],
    exclude: [],
    clientDir: path.join(root, "clients/web"),
    repoRoot: root,
  });
  assert.deepEqual(
    expected,
    abs(
      root,
      "clients/web/src/components/A.tsx",
      "clients/web/src/components/b/B.ts",
    ),
  );
});

test("an include starting with the client's own repo path resolves against the repo root", (t) => {
  const root = makeRepo(["clients/web/server/s.ts"]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = expandCoverageScope({
    include: ["clients/web/server/**/*.{ts,tsx}"],
    exclude: [],
    clientDir: path.join(root, "clients/web"),
    repoRoot: root,
  });
  assert.deepEqual(expected, abs(root, "clients/web/server/s.ts"));
});

test("an absolute include means itself", (t) => {
  const root = makeRepo(["core/json/a.ts", "core/json/deep/b.ts"]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = expandCoverageScope({
    include: [path.join(root, "core/json/**/*.{ts,tsx}")],
    exclude: [],
    clientDir: path.join(root, "clients/web"),
    repoRoot: root,
  });
  assert.deepEqual(
    expected,
    abs(root, "core/json/a.ts", "core/json/deep/b.ts"),
  );
});

test("an exclude matches absolute, client-relative or repo-relative paths", (t) => {
  const root = makeRepo([
    "clients/web/src/lib/keep.ts",
    "clients/web/src/lib/keep.test.ts",
    "clients/web/src/lib/index.ts",
    "clients/web/server/plugin.ts",
    "clients/web/server/kept.ts",
    "core/mcp/types.ts",
    "core/mcp/client.ts",
  ]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = expandCoverageScope({
    include: [
      "src/lib/**/*.ts",
      "clients/web/server/**/*.ts",
      path.join(root, "core/mcp/**/*.ts"),
    ],
    exclude: [
      "**/*.test.ts", // glob over any form
      "src/lib/index.ts", // client-relative
      "clients/web/server/plugin.ts", // repo-relative
      path.join(root, "core/mcp/types.ts"), // absolute
    ],
    clientDir: path.join(root, "clients/web"),
    repoRoot: root,
  });
  assert.deepEqual(
    expected,
    abs(
      root,
      "clients/web/server/kept.ts",
      "clients/web/src/lib/keep.ts",
      "core/mcp/client.ts",
    ),
  );
});

test("directories a glob matches are not expected files", (t) => {
  const root = makeRepo(["clients/tui/src/dir.ts/inner.ts"]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expected = expandCoverageScope({
    include: ["src/**/*.ts"],
    exclude: [],
    clientDir: path.join(root, "clients/tui"),
    repoRoot: root,
  });
  assert.deepEqual(expected, abs(root, "clients/tui/src/dir.ts/inner.ts"));
});

test("a report holding the declared set passes", () => {
  const expected = ["/r/clients/cli/src/a.ts", "/r/clients/cli/src/b.ts"];
  assert.deepEqual(
    diffCoverageScope({
      client: "cli",
      expected,
      reported: [...expected].reverse(),
      repoRoot: "/r",
    }),
    [],
  );
});

test("a narrower report fails, naming the client and each missing file", () => {
  const failures = diffCoverageScope({
    client: "web",
    expected: [
      "/r/clients/web/server/s.ts",
      "/r/clients/web/src/components/A.tsx",
      "/r/core/json/a.ts",
    ],
    reported: ["/r/clients/web/server/s.ts"],
    repoRoot: "/r",
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^web: 2 of 3 file\(s\)/);
  assert.match(failures[0], /report holds 1/);
  assert.match(failures[0], /\n {4}clients\/web\/src\/components\/A\.tsx\n/);
  assert.match(failures[0], /\n {4}core\/json\/a\.ts$/);
});

test("an include that expands to nothing fails rather than passing vacuously", () => {
  const failures = diffCoverageScope({
    client: "tui",
    expected: [],
    reported: [],
    repoRoot: "/r",
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /expands to no files at all/);
});

test("a stated omission is not reported missing, and a stale one is flagged", () => {
  const ok = diffCoverageScope({
    client: "web",
    expected: ["/r/clients/web/src/a.ts", "/r/clients/web/src/b.ts"],
    reported: ["/r/clients/web/src/a.ts"],
    omissions: { "clients/web/src/b.ts": "types only" },
    repoRoot: "/r",
  });
  assert.deepEqual(ok, []);
  const stale = diffCoverageScope({
    client: "web",
    expected: ["/r/clients/web/src/a.ts"],
    reported: ["/r/clients/web/src/a.ts"],
    omissions: { "clients/web/src/gone.ts": "types only" },
    repoRoot: "/r",
  });
  assert.equal(stale.length, 1);
  assert.match(stale[0], /KNOWN_OMISSIONS names clients\/web\/src\/gone\.ts/);
});

test("an omission without a reason is not honored and is itself a failure", () => {
  for (const reason of ["", "   ", undefined]) {
    const failures = diffCoverageScope({
      client: "web",
      expected: ["/r/clients/web/src/a.ts", "/r/clients/web/src/b.ts"],
      reported: ["/r/clients/web/src/a.ts"],
      omissions: { "clients/web/src/b.ts": reason },
      repoRoot: "/r",
    });
    assert.equal(failures.length, 2, `reason ${JSON.stringify(reason)}`);
    assert.match(failures[0], /^web: 1 of 2 file\(s\)/);
    assert.match(failures[0], /clients\/web\/src\/b\.ts/);
    assert.match(
      failures[1],
      /names clients\/web\/src\/b\.ts without a reason/,
    );
  }
});

test("an omission for a file the report now measures is flagged as stale", () => {
  const failures = diffCoverageScope({
    client: "web",
    expected: ["/r/clients/web/src/a.ts"],
    reported: ["/r/clients/web/src/a.ts"],
    omissions: { "clients/web/src/a.ts": "types only" },
    repoRoot: "/r",
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /which the report now measures/);
});

// Adapted: the roster tests are removed with the roster. The fixture below
// is his, moved to the repo root: one declaration matching three files, two
// of them outside `server/**`.
function makeRootFixture() {
  const root = makeRepo([
    "server/s.ts",
    "src/components/A.tsx",
    "core/json/a.ts",
  ]);
  const resolveOptions = async () => ({
    include: [
      "src/components/**/*.{ts,tsx}",
      "server/**/*.{ts,tsx}",
      path.join(root, "core/json/**/*.{ts,tsx}"),
    ],
    exclude: ["**/node_modules/**"],
  });
  /** @param {string[]} rel */
  const writeSummary = (rel) => {
    const summary = { total: {} };
    for (const r of rel) summary[path.join(root, r)] = {};
    mkdirSync(path.join(root, "coverage"), { recursive: true });
    writeFileSync(
      path.join(root, "coverage/coverage-summary.json"),
      JSON.stringify(summary),
    );
  };
  const inventory = () => [
    "core/json/a.ts",
    "server/s.ts",
    "src/components/A.tsx",
  ];
  return { root, resolveOptions, writeSummary, inventory };
}

const none = { excluded: {}, patterns: {}, omissions: {} };

test("run(): a complete report passes", async (t) => {
  const { root, resolveOptions, writeSummary, inventory } = makeRootFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeSummary(["server/s.ts", "src/components/A.tsx", "core/json/a.ts"]);
  const lines = [];
  const failures = await run({
    root,
    ...none,
    resolveOptions,
    inventory,
    log: (l) => lines.push(l),
  });
  assert.deepEqual(failures, []);
  assert.match(lines[0], /3 declared file\(s\), all measured/);
});

test("run(): the vitest-5 collapse to server/** fails (#2557)", async (t) => {
  const { root, resolveOptions, writeSummary, inventory } = makeRootFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeSummary(["server/s.ts"]);
  const failures = await run({
    root,
    ...none,
    resolveOptions,
    inventory,
    log: () => {},
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^mycelia: 2 of 3 file\(s\)/);
  assert.match(failures[0], /src\/components\/A\.tsx/);
  assert.match(failures[0], /core\/json\/a\.ts/);
});

test("run(): a missing summary fails rather than being skipped", async (t) => {
  const { root, resolveOptions, inventory } = makeRootFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const failures = await run({
    root,
    ...none,
    resolveOptions,
    inventory,
    log: () => {},
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /coverage-summary\.json/);
});
