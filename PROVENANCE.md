# Provenance of `AGENTS.md`

- **Copied from**: `NorthwoodsSentinel/fleet-mcp` (private), `origin/main` = `f1bea96`, file `AGENTS.md` (217 lines, blob `058b489b3b79f3013802708c74219bb2b5520f37`). fleet-mcp's own `PROVENANCE.md` traces each of its lines to WALL-E (`NorthwoodsSentinel/walle`), and WALL-E's traces each of its lines to the source.
- **The source**: `modelcontextprotocol/inspector` (public), branch `v2/main`, commit `d330df9617e44ec893bc1a53618662239342d433`, `AGENTS.md` (698 lines), by Cliff Hall and the MCP contributors. The Inspector line behind any row below is found by following the fleet-mcp line number through fleet-mcp's and WALL-E's tables; it is not re-derived here.
- **This repo's facts**: mycelia `origin/main` = `34c61d3`: `README.md`, `ATTRIBUTION.md`, `LICENSE`, `package.json`, `wrangler.toml` (names only), `.gitignore`, `.dev.vars.example`, `src/types.ts` (`Env`), `.github/workflows/ci.yml` (replaced), the file lists of `src/`, `tests/`, `scripts/`, `migrations/`, `network-management-examples/`; `git remote -v`; `gh api repos/NorthwoodsSentinel/mycelia` (public, fork of `wally-kroeker/mycelia`, default branch `main`, no rulesets, `main` unprotected, read 2026-11-15).
- **Rulings applied**: the owner's 2026-11-14 rulings on the Inspector's rules (worksheets of NOR-330), as fleet-mcp and WALL-E carry them; the owner's scope for this effort, NOR-381: "Private + public as open PRs", and its hard limits (no deploys, no migrations applied, no D1 or KV access, no secrets, no repository settings, no force-push, no behaviour change beyond what the gate needs).
- **Date built**: 2026-11-15. **Ticket**: NOR-389 (child of NOR-381).
- **Licence note**: as WALL-E and fleet-mcp record it, the source project's `LICENSE` states that the MCP project is in a licensing transition from the MIT License to Apache-2.0: code is under Apache-2.0 or MIT, and documentation contributions (excluding specifications) are under CC-BY-4.0. The text carried over here is from a documentation file. Attribution to the Model Context Protocol project and its contributors is kept. This repository's own licence (MIT, Wally Kroeker's, `LICENSE`) and credit (`ATTRIBUTION.md`) are unchanged.

## How to read the table

- **KEEP**: fleet-mcp's line unchanged.
- **ADAPT**: fleet-mcp's line with the smallest edit this repo's facts require. The row says what changed and why.
- **OURS**: text with no counterpart in fleet-mcp's file.
- **not applicable**: a fleet-mcp line left out.
- "Ours" is the line in `AGENTS.md` in the commit that added this file; "fleet-mcp" is the line in fleet-mcp's file at `f1bea96`.
- "F1" to "F4" are follow-ups listed in the NOR-389 pull request body; their Linear tickets are filed by the owner's coordinator, not by the agent that wrote this.

## Table 1: every part of `AGENTS.md`

| Ours | Section or rule | fleet-mcp | Verdict | What changed and why |
| --- | --- | --- | --- | --- |
| 1 | Title | 1 | ADAPT | This repo's name. |
| 3 | What the repo is | 3 | ADAPT | fleet-mcp's description replaced by this repo's from `README.md` (a mutual aid protocol for agents; a Worker on Hono over D1, KV and R2; cron). "No UI and no published package" kept (`package.json` has no `bin` and is not published). Added: the fork facts (`wally-kroeker/mycelia`, MIT, `ATTRIBUTION.md`, the `upstream` remote). "carry it through to merge" became "to an open pull request" (NOR-381, below at line 50). |
| 5 | The Worker here is the live bus; trust rules are behaviour | 5 | ADAPT | fleet-mcp's authority-boundary line describes its own envelope. Replaced by this repo's boundary: `wrangler.toml` sets `MODE = "fleet"` for the production Worker, so changes to `src/`, `migrations/`, `wrangler.toml` reach every agent once deployed; the mode matrix is in `src/middleware/fleet-gate.ts`, the audited findings in `docs/KNOWN-ISSUES.md`. |
| 7 | "This file holds the rules" | 7 | KEEP | |
| 9 | Procedures live in `.claude/skills/` | 9 | ADAPT | Marker added: `.claude/` is in this repo's `.gitignore`, so no skill can be committed until that line changes. |
| 11 | Pointer to `PROVENANCE.md` | 11 | KEEP | |
| 13-15 | Skills index | 13-19 | ADAPT | fleet-mcp's `client-smoke` row and its `release` marker removed: neither exists here. The sentence that a change adding a skill adds its row kept, with the column names stated. |
| 17-19 | Development setup; the Inspector's runner | 21-23 | KEEP | |
| 20 | This repo's own code | 24 | ADAPT | This repo's runtimes and commands: Bun for installs and scripts (CI pins `1.3.6`, the value its `ci.yml` had), tests under Node via Vitest, `bun run build` the dry-run bundle; better-sqlite3's install script (`trustedDependencies`); `bun.lock` is the lockfile and `package-lock.json` is stale (F4). fleet-mcp's host-bound test notes removed (not applicable). |
| 22-24 | Dependency placement: `overrides` | 26-28 | KEEP | |
| 26-28 | Dependency updates are issue-driven | 30-32 | ADAPT | Marker: no sweeps here; the Dependabot settings were not read, because repository settings are the owner's. |
| 30 | Alerts stay on | 34 | KEEP | |
| 31 | Read back a UI-only setting | 35 | KEEP | |
| 32 | Actions pinned by SHA; here, every job | 36 | KEEP | fleet-mcp's reason (the checked commit is the one the owner deploys as the Worker) holds here word for word. |
| 34-36 | The upstream watch | 38-40 | ADAPT | Upstreams are this repo's: the fork parent, Hono, and the Inspector's rules files. fleet-mcp's MCP SDK and vendored courier are not here. Marker: no sweeps yet. |
| 38-46 | Sweep rules | 42-50 | KEEP | |
| 48 | Contributing (heading) | 52 | KEEP | |
| 50 | The owner picks; an agent opens; the owner merges | 54 | ADAPT | fleet-mcp's rule lets an agent merge its own pull request (fleet rule, owner 2026-11-15). For this public repo the owner's NOR-381 scope is "Private + public as open PRs", so here an agent leaves the pull request open; the line says why the fleet rule does not apply. |
| 52 | Every PR must reference an issue | 56 | ADAPT | One form added: `Part of NOR-<PARENT> — NOR-<NUMBER>` for a child of a larger effort (the form NOR-381's children use). |
| 54 | Protocol changes are specs first | none | OURS | This repo's existing OpenSpec process (`README.md`, Contributing; `openspec/`), stated so a reviewer can cite it. |
| 56 | Nothing is opened against the fork parent | none | OURS | `ATTRIBUTION.md` ("Contributing Back") and the owner-only "Anything public or sent to other people" (fleet-mcp line 215), applied to the `upstream` remote. |
| 58-65 | Project Status and Direction | 58-65 | KEEP | Table widths realigned. |
| 67-68 | Repo and issue tracker | 67-68 | ADAPT | `NorthwoodsSentinel/fleet-mcp` (private) became `NorthwoodsSentinel/mycelia` (public; a GitHub fork of `wally-kroeker/mycelia`). |
| 70 | Branching corollary | 70 | KEEP | |
| 72-81 | Keep documentation files up to date | 72-81 | KEEP | |
| 82 | Keep the credit | none | OURS | NOR-381's limit: keep `ATTRIBUTION.md`, `LICENSE` and upstream credit intact; copied files keep their provenance headers. |
| 84-86 | Maintaining the skills (intro) | 83-85 | KEEP | |
| 88 | Skills rule 1: `verify:skills` | 87 | ADAPT | Marker: the guard is not here; it comes in with the first skill (fleet-mcp brought it with its first skill, NOR-359). |
| 89-95 | Skills rules 2-4 and the two notes | 88-94 | KEEP | |
| 97-114 | Issue-driven Work Style | 96-113 | KEEP | Except line 111: the ruleset marker "[Not yet in this repo: NOR-356]" names fleet-mcp's ticket; here it reads "setting it is the owner's act" (no ticket named; the owner's coordinator files it). |
| 115 | Scan the diff before every push | none | OURS | NOR-381's limit "Personal-data scan before every push", stated as a rule because this repo is public and history is never rewritten. |
| 117-125 | Responding to Code Reviews | 115-123 | KEEP | |
| 127 | Always test (heading) | 125 | KEEP | |
| 129 | Coverage bar 90 on four dimensions; CI enforces it | 127 | ADAPT | The bar and the owner's default kept. fleet-mcp's facts about its Bun suite and NOR-364/NOR-375 replaced by this repo's: one Vitest suite; NOR-389 put eleven files under the bar, five of them by new tests; nineteen excluded under F3. |
| 130-133 | Unreachable branches; error output; exact filenames; the whitelist | 128-131 | KEEP | |
| 135-146 | Test-gate timeouts | 133-144 | KEEP | |
| 148-150 | Mandatory pre-push gate (heading and note) | 146-148 | ADAPT | This repo's stages: `validate` (pins, guard tests, format, lint, typecheck of two projects and its guard, tests, dry-run build), `local:gate` adds `local:dco` and `coverage`. No `verify:skills`, `test:portable` or `smoke`; the reason for no smoke stated (an HTTP API Worker, not an MCP server). |
| 152-154 | Formatter; `local:gate`; `validate` is not a substitute | 150-152 | KEEP | |
| 156-167 | Waiting on long-running work | 154-165 | KEEP | |
| 169-171 | Build output is never a gate target | 167-169 | ADAPT | `coverage/` added to what this repo writes; it was added to `.gitignore` by NOR-389. |
| 173-174 | Two of the source's reasons | 171-172 | KEEP | |
| 175 | New build locations; never widen an ignore; the exception | 173 | ADAPT | The source's sentences kept. fleet-mcp's exception (its NOR-375 files and vendored courier) replaced by this repo's, in the same form fleet-mcp's NOR-355 took: exact paths, one line per file, each list citing its follow-up (F1 format, 49 files; F2 lint, 20 files; F3 coverage, 19 files); every file is in the typecheck. |
| 177-182 | Lint has no warning tier | 175-180 | KEEP | |
| 184-186 | TypeScript for all new code; recorded exceptions | 182-184 | ADAPT | fleet-mcp's exception (one Mac shell wrapper) replaced by this repo's: the existing shell scripts in `scripts/`, the upstream Discord bot in Python, and the copied `.mjs` guards (fleet-mcp has the same guards and leaves them `.mjs`). |
| 187-198 | TypeScript bullets; floating promises | 185-196 | KEEP | |
| 200-202 | Cloudflare work (OURS): heading and scope | 198-200 | ADAPT | Scope is this repo's Worker: the production config in `wrangler.toml` (the live bus: D1, KV, service bindings, cron) and `env.dev`. |
| 204 | Deploying is the release; the owner's act; no deploy from CI | 202 | ADAPT | The Inspector-record half of the ledger removed (no Inspector stage here). Marker without a ticket number. |
| 205 | Applying a migration is a deploy | none | OURS | NOR-381's limits: "no migrations applied anywhere, no D1/KV access". `migrations/` is the one place a change reaches live state without `wrangler deploy`. |
| 206 | Secrets, bindings, vars and routes by name only | 203 | ADAPT | fleet-mcp's marker named its `src/worker.ts` variables; here the names the code reads are in `src/types.ts` (`Env`) and `.dev.vars.example`. |
| 207 | Check Cloudflare's current documentation | 204 | ADAPT | D1, R2 and cron triggers added to the list, since this Worker uses them. |
| 208 | Local and deployed results are separate | 205 | ADAPT | This repo's in-process target is Vitest on Node with the better-sqlite3 D1 adapter; no Inspector record; CI runs only the in-process target. fleet-mcp's NOR-362 marker removed. |
| 210-220 | Only the owner does (fleet-mcp's list) | 207-217 | KEEP | All nine lines verbatim. |
| 221 | Migrations and live D1/KV | none | OURS | NOR-381's limits. |
| 222 | Merging a pull request here | none | OURS | NOR-381: "Private + public as open PRs". |
| 223 | Anything sent to the fork parent | none | OURS | Brief for NOR-389: "never open anything against the upstream fork parent". |

## Table 2: what was not brought over

| fleet-mcp | Section or rule | Verdict | Reason |
| --- | --- | --- | --- |
| 17 | The `client-smoke` skill row | not applicable | No skill here; this repo is not an MCP server. |
| 24 (part) | fleet-mcp's host-bound integration suite and `test:portable` | not applicable | fleet-mcp's host-bound tests; this repo has one portable Vitest suite. |
| 40 (part) | The MCP SDK and the vendored courier as upstreams | not applicable | Neither is a dependency here. |

Every other fleet-mcp line is in Table 1.
