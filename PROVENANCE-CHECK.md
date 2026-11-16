# PROVENANCE-CHECK

This file records where the files NOR-389 brought into this repo came from, and how to check that each is what it claims to be. It follows fleet-mcp's `PROVENANCE-CHECK.md` (`NorthwoodsSentinel/fleet-mcp`, `origin/main` `f1bea96`). `PROVENANCE.md` belongs to the rules file, `AGENTS.md`.

- Date: 2026-11-15
- Ticket: NOR-389 (child of NOR-381)

## 1. Where the files came from

The direct source of every file below is `NorthwoodsSentinel/fleet-mcp` at `origin/main` = `f1bea96` (a private repository). fleet-mcp took them from WALL-E (`NorthwoodsSentinel/walle`, also private) and from the MCP Inspector (`modelcontextprotocol/inspector`, public, commit `d330df9617e44ec893bc1a53618662239342d433`, by Cliff Hall and the MCP contributors); each file's own header names that chain, and fleet-mcp's `PROVENANCE-CHECK.md` holds the blob ids at each step.

- Licence: the Inspector's `LICENSE` (blob `4a93985763241755401a10678395303de4e720ba`) describes a move from the MIT License to Apache-2.0 for code, with documentation under CC-BY-4.0. Each copied file keeps the header naming its source; attribution to the Model Context Protocol project and its contributors is kept.
- Unlike fleet-mcp, this repo does not hold an unedited copy in a commit of its own: this repository is public and its source is private, and the unedited fleet-mcp text names private hosts and files that do not belong in a public history. So the edited files went in already edited, and the record of each edit is the file's own header plus the table below. With read access to fleet-mcp, `git hash-object <file>` here against `git -C <fleet-mcp> rev-parse f1bea96:<path>` checks a KEEP row (equal ids mean equal bytes), and `git diff --no-index` between the two shows every line an ADAPT row changed.

| This repo | fleet-mcp path at `f1bea96` | fleet-mcp blob | Verdict | What changed |
| --- | --- | --- | --- | --- |
| `scripts/dco-check.mjs` | same | `5338fedd25763bc4b7cb454c1eb432d7deaf8a1d` | KEEP | Byte-identical. |
| `scripts/dco-check.test.mjs` | same | `7fd4bd08dd3c7bddf14c1076ad7f2a7894ccec50` | KEEP | Byte-identical. |
| `scripts/lib/main-module.mjs` | same | `b35c2374c50999bf1f5a1a2fd19d990ff960b63f` | KEEP | Byte-identical. |
| `scripts/lib/main-module.test.mjs` | same | `66adff993cd1609c4af368f60df4b38a73923922` | KEEP | Byte-identical. |
| `scripts/verify-action-pins.mjs` | same | `011a04c44ce9769bd15f8bfa82cb27d89162e957` | KEEP | Byte-identical. Its header's references to fleet-mcp's design and tickets are fleet-mcp's. |
| `scripts/verify-action-pins.test.mjs` | same | `82686195e6538f7f2f7fad30bf62a4701d2ed630` | KEEP | Byte-identical. |
| `scripts/lib/ts-inventory.mjs` | same | `03fbcc1eafcbd9954cea717a25b6034977b0b51e` | KEEP | Byte-identical. |
| `scripts/ts-inventory.test.mjs` | same | `752a615b9ccd75a3746e96cb72d563c0319ae410` | KEEP | Byte-identical. |
| `scripts/verify-coverage-scope.mjs` | same | `d7942703ca4f96128fa78ef31f2383862b8ce400` | ADAPT | A header block; `FOLLOWUP`, `EXCLUDED` and `EXCLUDED_PATTERNS` list this repo's files; the client name in `run()` is `mycelia`. |
| `scripts/verify-coverage-scope.test.mjs` | same | `34d5bb9a0dd2accf33ffbd51557b7f9a009ecb0e` | ADAPT | A header block; the asserted client name is `mycelia`. |
| `scripts/verify-typecheck-coverage.mjs` | same | `fd9163fdd668cf2ead9aeb10040a0227ed43d20a` | ADAPT | Two projects (`PROJECTS`: `tsconfig.json`, `tsconfig.node.json`), each listed with `--listFilesOnly`, the union compared; a failing project is named. |
| `scripts/verify-typecheck-coverage.test.mjs` | same | `719fcbcbf856e2fb06c743ea062c4ddd9e928f24` | ADAPT | A header block; the shipped-EXCLUDED case cites NOR-389; one case added for the two-project union. |
| `.github/workflows/main.yml` | same | `7932a098e637e270effd73a6bb05c2ce8b7a9108` | ADAPT | Header rewritten for this repo; the `concurrency` block kept from this repo's `ci.yml`; Bun `1.3.6` (this repo's pin) instead of `1.3.14`; install without `--ignore-scripts` (better-sqlite3's native build); the run line is `validate && coverage` (no `smoke`). Triggers, permissions, job name, timeout and pins are fleet-mcp's. |
| `.github/workflows/dco.yml` | same | `9d3165be6059d7798e32719ccb1510ba5db2294c` | ADAPT | A trailing header paragraph; the PR job's checkout returns to the source's `persist-credentials: false` (public repo). |
| `eslint.config.mjs` | `eslint.config.js` | `24be32c48853228cc0437f8d82fe728a6ef0d566` | ADAPT | Renamed `.mjs` (no `"type": "module"` here); two parser projects; `.mjs` guards ignored by extension; the F2 exact-path list; the config block names `eslint.config.mjs`. |
| `.prettierignore` | same | `5c8bf4c839ca30b13bef0bcb7272372a81ba5fe0` | ADAPT | Header rewritten; no vendored code; the F1 exact-path list. |
| `vitest.config.ts` | same | `958b47b52ac48db4b1cc47eb74f3789f37aa8aa4` | ADAPT | This repo's existing test block kept (`tests/**/*.test.ts`); fleet-mcp's coverage block (the Inspector's thresholds) with this repo's exclusions (F3). |
| `AGENTS.md` | same | `058b489b3b79f3013802708c74219bb2b5520f37` | ADAPT | Line by line in `PROVENANCE.md`. |

Not copied from fleet-mcp, and why: `scripts/smoke-inspector.mjs` and its test (this repo is not an MCP server); `scripts/verify-skills.mjs` and `scripts/lib/skill-manifest.mjs`, `scripts/lib/npm-scripts.mjs` with their tests (no skills here); `tools/test-report.ts` (it reports fleet-mcp's Bun suite); fleet-mcp's Codex attack cases under `tools/*.test.ts` (they attack fleet-mcp's own design and files; the guards' own `node --test` suites came across unchanged).

## 2. Written here

| File | Why |
| --- | --- |
| `tsconfig.node.json` | The second typecheck project: tests, scripts and the Vitest config under Node, Workers and Vite types. `tsconfig.json` stays the Worker program alone. |
| `tests/audit-db.test.ts`, `tests/kv.test.ts`, `tests/revocation.test.ts`, `tests/state-machine-coverage.test.ts`, `tests/pop-coverage.test.ts` | New tests that bring `src/lib/audit.ts`, `src/lib/db.ts`, `src/lib/kv.ts`, `src/lib/revocation.ts`, `src/models/state-machine.ts` and `src/lib/pop.ts` to the bar. No product code changed. |
| `PROVENANCE.md`, `PROVENANCE-CHECK.md` | The records. |

## 3. Action pins

The three action pins in `.github/workflows/main.yml` and `.github/workflows/dco.yml` are fleet-mcp's. Each was read again from its own tag with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` on 2026-11-15 for NOR-389; each is object type `commit` and equals the pinned SHA.

| Action | Commit | Release |
| --- | --- | --- |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | `v7.0.1` |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` | `v7.1.0` |
| `oven-sh/setup-bun` | `0c5077e51419868618aeaa5fe8019c62421857d6` | `v2.2.0` |
