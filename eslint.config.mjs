// Lint configuration. mycelia (NOR-389): copied from
// NorthwoodsSentinel/fleet-mcp origin/main f1bea96 (blob
// 24be32c48853228cc0437f8d82fe728a6ef0d566) and edited for this repo: two
// parser projects (tsconfig.json, the Worker program; tsconfig.node.json, the
// tests and scripts), the `.mjs` guards ignored by extension rather than all
// of scripts/ (scripts/ also holds two TypeScript CLIs, which are linted),
// no vendored code, and the exact-path list of existing files with findings
// (follow-up F2). Named `.mjs`, not fleet-mcp's `.js`: this package.json has
// no `"type": "module"`, and adding one is a package-wide change the gate does
// not need. Record: PROVENANCE-CHECK.md. fleet-mcp's header follows.
//
// Lint configuration. NOR-355; design: docs/DESIGN-nor-355-check.md, section 4.
//
// Copied from WALL-E's eslint.config.js (NorthwoodsSentinel/walle origin/main
// 5fb8747, blob 109d7e55) and edited: one TypeScript block over all four
// TypeScript extensions, one parser project (tsconfig.json), and this repo's
// ignore list. The rule set is the MCP Inspector's root config (eslint.config.js
// at d330df96, blob 9990e974), reduced to one scope: `js.configs.recommended`,
// `tseslint.configs.recommended`, its `_`-prefix `no-unused-vars` block and
// type-aware `no-floating-promises` at `error`.
//
// `npm run lint` is `eslint . --max-warnings 0`: the whole tree, and a warning
// fails exactly as an error does (AGENTS.md: lint has no warning tier).
//
// The parser is given tsconfig.json. A TypeScript file outside that project
// fails lint with "was not found in any of the provided project(s)".
//
// The `.mjs` files under scripts/ are not linted, as in WALL-E and the
// Inspector (his lint scopes do not cover `scripts/`); they are
// format-checked and tested under `node --test`.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    // Build and install output is never a gate target (AGENTS.md). The same
    // names as .gitignore.
    "node_modules/**",
    ".wrangler/**",
    "dist/**",
    "coverage/**",
    // The copied `.mjs` guards: not linted (see above).
    "scripts/**/*.mjs",
    // NOR-389 follow-up F2 (listed in the NOR-389 pull request; ticket to be
    // filed): existing first-party files with lint findings when measured for
    // NOR-389. One line each; remove a line when its file is fixed. AGENTS.md
    // records the exception.
    "scripts/MyceliaClient.ts",
    "scripts/seed-fleet.ts",
    "src/lib/delegation.ts",
    "src/lib/dpop.ts",
    "src/middleware/auth.ts",
    "src/routes/admin.ts",
    "src/routes/agents.ts",
    "src/routes/claims-responses.ts",
    "src/routes/ratings.ts",
    "src/routes/requests.ts",
    "tests/delegation.test.ts",
    "tests/fleet-mode.test.ts",
    "tests/integration/_fixtures.ts",
    "tests/integration/_smoke.test.ts",
    "tests/integration/admin-pop.test.ts",
    "tests/integration/client-ref.test.ts",
    "tests/integration/inbox-filter.test.ts",
    "tests/integration/owner-cap.test.ts",
    "tests/integration/response-bugs.test.ts",
    "tests/pop.test.ts",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An `_`-prefix is the explicit "intentionally unused" marker.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // A floated promise reads like an awaited one minus four characters,
      // and its rejection surfaces somewhere else entirely.
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
  {
    files: ["eslint.config.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
]);
