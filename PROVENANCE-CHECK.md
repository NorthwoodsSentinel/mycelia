# PROVENANCE-CHECK

This file records where the files NOR-389 brought into this repo came from, and how to check each against its source. `PROVENANCE.md` belongs to the rules file, `AGENTS.md`.

- Date: 2026-11-15
- Ticket: NOR-389 (child of NOR-381)

## 1. Files adapted from the MCP Inspector

- Source repo: `modelcontextprotocol/inspector` (public), branch `v2/main`, commit `d330df9617e44ec893bc1a53618662239342d433`, by the MCP Inspector maintainers and contributors.
- Licence: the source's `LICENSE` (blob `4a93985763241755401a10678395303de4e720ba`) describes a move from the MIT License to Apache-2.0 for code, with documentation under CC-BY-4.0. Each adapted file keeps a header naming its source; attribution to the Model Context Protocol project and its contributors is kept.
- To check a file: `git -C <inspector clone> show d330df96:<source path>` and `git diff --no-index` against the file here shows every line this repo's adaptation changed; each file's header names its edits.

| This repo | Source path at `d330df96` | Source blob | What the adaptation changed |
| --- | --- | --- | --- |
| `scripts/dco-check.mjs` | `scripts/dco-check.mjs` | `04446dc9dd80cd304752b811d5bae24492f4e152` | A header block; the `--base` error example names `origin/main`. |
| `scripts/dco-check.test.mjs` | `scripts/dco-check.test.mjs` | `510b5e885187541a99ccf99910c88a1465c76f85` | A header block. |
| `scripts/lib/main-module.mjs` | `scripts/lib/main-module.mjs` | `45a6baf3ebc1812fd8b4d7910b2cf3d77a2d7610` | A header block; the entry path is also compared after resolving symlinks (otherwise `main()` never runs from a symlinked directory and the check exits 0 having checked nothing). |
| `scripts/lib/main-module.test.mjs` | `scripts/lib/main-module.test.mjs` | `018271d2f796079b3b428fa9418984b54dc610bc` | A header block. |
| `scripts/verify-action-pins.mjs` | `scripts/verify-action-pins.mjs` | `a8988d38a3f9633c47f2bdad6e63045ca6f21db2` | Every job checked, not only credentialed ones; a local `./…` ref is a finding; zero workflow files fails; a non-regular workflow entry is a finding and is read through one `O_NOFOLLOW` descriptor; `SHA_REF` defined locally. |
| `scripts/verify-action-pins.test.mjs` | `scripts/verify-action-pins.test.mjs` | `13f7bada92f7b1b1f91654ec0cc30f95b3b09708` | Four expectations changed with the guard (marked "Adapted:"); cases added for the empty directory, a non-workflow file and a symlinked workflow. |
| `scripts/verify-coverage-scope.mjs` | `scripts/verify-coverage-scope.mjs` | `ec119f3d5bc1b91ecdd0b674335abda2ae466237` | One root run instead of the source's client roster; a tracked-file inventory with exact-path `EXCLUDED` and reviewed `EXCLUDED_PATTERNS`; `--prepare` removes a stale summary; the summary is read as a regular file with canonical paths. |
| `scripts/verify-coverage-scope.test.mjs` | `scripts/verify-coverage-scope.test.mjs` | `4f4f97e528e88b1472fb44d35e6abd4552b4060c` | Roster tests removed with the roster; the `run()` cases rewritten for one root run. |
| `scripts/verify-typecheck-coverage.mjs` | `scripts/verify-typecheck-coverage.mjs`, phase 2 (lines 620-679) | `1f71e2c4bed881dbb63fa6b85f37d33e719c9548` | Only phase 2 taken (every tracked TypeScript file in a `tsc --listFilesOnly` program); here over two projects, `tsconfig.json` and `tsconfig.node.json`. |
| `scripts/lib/ts-inventory.mjs` | same file, lines 79-86 and 406-446 | `1f71e2c4bed881dbb63fa6b85f37d33e719c9548` | `isRequiredSource` and the `git ls-files` inventory, NUL-delimited here. |
| `scripts/verify-typecheck-coverage.test.mjs`, `scripts/ts-inventory.test.mjs` | none | | Written for the adapted guards. |
| `.github/workflows/dco.yml` | `.github/workflows/dco.yml` | `360fe4f17c2233f041549e60128becd57f5c95b1` | One long-lived branch (`main`), so no `v2/**` filter; actions pinned to commit SHAs. |
| `.github/workflows/main.yml` | `.github/workflows/main.yml` | `c1eeb58a6775d95cce43f6f99fc09cfec2dfccc1` | The shape kept (file and workflow name, `contents: read`, one pinned runtime, `timeout-minutes`); one `validate` job running this repo's stages; it replaces this repo's `ci.yml`, whose concurrency block it keeps. |
| `eslint.config.mjs` | `eslint.config.js` | `9990e97464a0905f38044990f69a309b18e0fb0d` | The rule set reduced to one TypeScript scope; two parser projects; this repo's ignores and the F2 exact-path list; named `.mjs`. |
| `vitest.config.ts` | `clients/launcher/vitest.config.ts`, lines 29-35 | `4c4caacf8a6d709d602768a34fd0f43585c59c0a` | The per-file 90/90/90/90 thresholds; this repo's test glob kept; whole-tree coverage `include` and the F3 exact-path list. |
| `AGENTS.md` | `AGENTS.md` | `796f61b0c32ff8ff4ae8cf41601987dfbf4110ad` | Section by section in `PROVENANCE.md`. |

## 2. Written here

| File | Why |
| --- | --- |
| `.prettierignore` | The F1 exact-path list and the coverage output. |
| `tsconfig.node.json` | The second typecheck project: tests, scripts and the Vitest config under Node, Workers and Vite types. `tsconfig.json` stays the Worker program alone. |
| `tests/audit-db.test.ts`, `tests/kv.test.ts`, `tests/revocation.test.ts`, `tests/state-machine-coverage.test.ts`, `tests/pop-coverage.test.ts` | New tests that bring `src/lib/audit.ts`, `src/lib/db.ts`, `src/lib/kv.ts`, `src/lib/revocation.ts`, `src/models/state-machine.ts` and `src/lib/pop.ts` to the bar. No product code changed. |
| `PROVENANCE.md`, `PROVENANCE-CHECK.md` | The records. |

## 3. Action pins

Each pin in `.github/workflows/main.yml` and `.github/workflows/dco.yml` was read from its own tag with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` on 2026-11-15; each is object type `commit` and equals the pinned SHA.

| Action | Commit | Release |
| --- | --- | --- |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | `v7.0.1` |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` | `v7.1.0` |
| `oven-sh/setup-bun` | `0c5077e51419868618aeaa5fe8019c62421857d6` | `v2.2.0` |
