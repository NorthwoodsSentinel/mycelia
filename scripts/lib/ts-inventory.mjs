// The tracked-TypeScript inventory that verify-typecheck-coverage.mjs and
// verify-coverage-scope.mjs compare their sets against. NOR-355; design:
// docs/DESIGN-nor-355-check.md, "Every tracked TypeScript file is typechecked
// and coverage-measured, or named" (Codex design review r1, finding 1).
//
// Behaviour copied from the MCP Inspector's scripts/verify-typecheck-coverage.mjs
// (modelcontextprotocol/inspector d330df9617e44ec893bc1a53618662239342d433,
// blob 1f71e2c4bed881dbb63fa6b85f37d33e719c9548): `isRequiredSource` (his lines
// 79-86) and the `git ls-files "*.ts" "*.tsx" "*.mts" "*.cts"` inventory with
// build output dropped (his lines 406-446). Deny-by-default: a file at a new
// top-level location is required without editing anything.
//
// One change: `git ls-files -z`. His version splits on newlines, which turns a
// filename containing a newline into two invented paths and returns names Git
// has quoted (spaces are fine, but tabs, non-ASCII and quotes come back in
// C-quoted form). NUL-delimited output has neither problem (Codex case 13).
//
// Build output dropped here, by path segment: the build writes dist/ and
// .wrangler/ (AGENTS.md), coverage writes coverage/, the Bun report step writes
// .test-report/, and node_modules is never tracked first-party source.

import { spawnSync } from "node:child_process";

/** The four TypeScript source extensions, minus ambient declaration files. */
export const isRequiredSource = (rel) =>
  /\.(ts|tsx|mts|cts)$/.test(rel) && !/\.d\.(ts|mts|cts)$/.test(rel);

export const GENERATED_DIRS = new Set([
  "dist",
  ".wrangler",
  "coverage",
  ".test-report",
  "node_modules",
]);

const isGenerated = (rel) =>
  rel.split("/").some((segment) => GENERATED_DIRS.has(segment));

/**
 * Split NUL-delimited `git ls-files -z` output into paths.
 *
 * @param {string} out
 * @returns {string[]}
 */
export function parseNulList(out) {
  return out.split("\0").filter((p) => p !== "");
}

/**
 * Tracked first-party TypeScript, repo-relative, sorted. Throws when Git
 * fails, so "inventory unavailable" is never read as "nothing required".
 * An empty result is returned as empty; each caller fails on it.
 *
 * @param {string} root
 * @param {string} [git] the git executable (found on PATH, as the source does)
 * @returns {string[]}
 */
export function trackedTypeScript(root, git = "git") {
  const ran = spawnSync(
    git,
    ["ls-files", "-z", "--", "*.ts", "*.tsx", "*.mts", "*.cts"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (ran.error)
    throw new Error(
      `the TypeScript inventory could not run git ls-files: ${ran.error.message}`,
    );
  if (ran.status !== 0)
    throw new Error(
      `the TypeScript inventory failed: git ls-files exited ${ran.status ?? `by signal ${ran.signal}`}: ${ran.stderr.trim()}`,
    );
  return parseNulList(ran.stdout)
    .filter(isRequiredSource)
    .filter((f) => !isGenerated(f))
    .sort();
}
