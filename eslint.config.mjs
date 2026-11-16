// Lint configuration. mycelia (NOR-389).
//
// The rule set is the MCP Inspector's root config (modelcontextprotocol/inspector at commit d330df9617e44ec893bc1a53618662239342d433,
// eslint.config.js, blob 9990e97464a0905f38044990f69a309b18e0fb0d), reduced
// to one scope: `js.configs.recommended`, `tseslint.configs.recommended`, its
// `_`-prefix `no-unused-vars` block and type-aware `no-floating-promises` at
// `error`. Adapted for this repo: one TypeScript block over all four
// TypeScript extensions, two parser projects (tsconfig.json, the Worker
// program; tsconfig.node.json, the tests and scripts), and this repo's ignore
// list, including the exact-path list of existing files with findings
// (follow-up F2). Record: PROVENANCE-CHECK.md.
//
// `npm run lint` is `eslint . --max-warnings 0`: the whole tree, and a warning
// fails exactly as an error does (AGENTS.md: lint has no warning tier).
//
// The parser is given both projects. A TypeScript file outside them fails
// lint with "was not found in any of the provided project(s)".
//
// The `.mjs` guards under scripts/ are not linted, as in the Inspector (its
// lint scopes do not cover `scripts/`); they are format-checked and tested
// under `node --test`. The two TypeScript CLIs in scripts/ are linted.
//
// Named `.mjs`: this package.json has no `"type": "module"`, and adding one is
// a package-wide change the gate does not need.

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
