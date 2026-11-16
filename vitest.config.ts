// Vitest configuration: which tests run, and the per-file coverage bar.
// NOR-389.
//
// The test block is this repo's own, kept: `tests/**/*.test.ts`, run under
// the default node pool. Integration tests use a better-sqlite3-backed D1
// adapter (tests/integration/_d1-adapter.ts); unit tests are pure-function
// and need no special setup. A glob over one directory skips nothing named
// `*.test.ts` in it (a file named otherwise is not run: known limitation F6).
//
// The coverage thresholds are the MCP Inspector's
// (modelcontextprotocol/inspector d330df96,
// clients/launcher/vitest.config.ts:29-35): 90 on all four dimensions, per
// file. Vitest and its V8 provider are pinned to the Inspector's 4.1.12.
//
// `coverage.include` is the whole tree over all four TypeScript extensions,
// so a new file anywhere is measured without anyone remembering to add it. A
// file no test loads is reported at 0 and fails. Every exclusion below is a
// named line with its reason, and each has its twin in
// scripts/verify-coverage-scope.mjs (EXCLUDED, EXCLUDED_PATTERNS), which
// fails naming any tracked TypeScript file that is neither declared here nor
// named there.
//
// `testTimeout` is stated once, here (AGENTS.md: budgets are chosen values,
// stated once). 30 s, a chosen value; the whole suite ran in
// under 3 s locally when this was written, so it is a hang guard only.
// `retry` stays unset: a retry would turn a real red into a quiet green.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      // `skipFull: false`: list every measured file, including one at 100%.
      reporter: [["text", { skipFull: false }], "json-summary"],
      include: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      exclude: [
        // Test files and their helpers are not code under test.
        "**/*.test.ts",
        "tests/**",
        // Configuration, not code under test.
        "vitest.config.ts",
        // NOR-389 follow-up F3 (listed in the NOR-389 pull request; ticket to
        // be filed): existing first-party code below the bar on at least one
        // dimension when measured for NOR-389. Brought in by new tests beside
        // it, one file at a time; remove its line here and in
        // scripts/verify-coverage-scope.mjs in the same change.
        "scripts/MyceliaClient.ts",
        "scripts/seed-fleet.ts",
        "src/cron.ts",
        "src/index.ts",
        "src/lib/delegation.ts",
        "src/lib/dpop.ts",
        "src/middleware/auth.ts",
        "src/middleware/rate-limit.ts",
        "src/middleware/sanitize.ts",
        "src/routes/admin.ts",
        "src/routes/agents.ts",
        "src/routes/capabilities.ts",
        "src/routes/claims-responses.ts",
        "src/routes/feed.ts",
        "src/routes/fleet-bindings.ts",
        "src/routes/ratings.ts",
        "src/routes/register.ts",
        "src/routes/requests.ts",
        "src/routes/schemas.ts",
        // Build and install output (the same names as .gitignore).
        "node_modules/**",
        ".wrangler/**",
        "dist/**",
        "coverage/**",
      ],
      thresholds: {
        perFile: true,
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
