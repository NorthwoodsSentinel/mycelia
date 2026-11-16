# Provenance of `AGENTS.md`

- **Source**: `modelcontextprotocol/inspector` (public), branch `v2/main`, commit `d330df9617e44ec893bc1a53618662239342d433`, `AGENTS.md` (698 lines, blob `796f61b0c32ff8ff4ae8cf41601987dfbf4110ad`), by the MCP Inspector maintainers and contributors. The rules here are that file's, adapted for this repo by the same method used on the owner's other repositories: keep a rule where it applies, make the smallest edit this repo's facts require, add this repo's own rules marked OURS, and leave out what has nothing to act on here.
- **This repo's facts**: mycelia `origin/main` = `34c61d3`: `README.md`, `ATTRIBUTION.md`, `LICENSE`, `package.json`, `wrangler.toml` (names only), `.gitignore`, `.dev.vars.example`, `src/types.ts` (`Env`), `.github/workflows/ci.yml` (replaced), the file lists of `src/`, `tests/`, `scripts/`, `migrations/`, `network-management-examples/`; `git remote -v`; `gh api repos/NorthwoodsSentinel/mycelia` (public, a fork of `wally-kroeker/mycelia`, default branch `main`, no rulesets, `main` unprotected; read 2026-11-15).
- **Rulings applied**: the owner's 2026-11-14 rulings on the source's rules (keep the source's way until there is a reason to depart; Linear in place of GitHub issues; `Todo` is the owner's approval; signed-off commits; Codex as the reviewer; no warning tier; the 90 coverage bar), and the owner's scope for this effort, NOR-381: "Private + public as open PRs", with its hard limits (no deploys, no migrations applied, no D1 or KV access, no secrets, no repository settings, no force-push, no behaviour change beyond what the gate needs).
- **Date built**: 2026-11-15. **Ticket**: NOR-389 (child of NOR-381).
- **Licence note**: the source project's `LICENSE` (blob `4a93985763241755401a10678395303de4e720ba`) states that the MCP project is in a licensing transition from the MIT License to Apache-2.0: code is under Apache-2.0 or MIT, and documentation contributions (excluding specifications) are under CC-BY-4.0. The text carried over here is from a documentation file. Attribution to the Model Context Protocol project and its contributors is kept. This repository's own licence (`LICENSE`, MIT) and credit (`ATTRIBUTION.md`) are unchanged.

## How to read the table

- **KEEP**: the source's rule, unchanged in substance (the source's board, branch and tool names are replaced by this repo's: Linear for GitHub issues, `main` for `v2/main`, Codex for Copilot).
- **ADAPT**: the source's rule with the smallest edit this repo's facts require. The row says what changed and why.
- **OURS**: a rule with no counterpart in the source.
- "Ours" is the line in `AGENTS.md` at the commit that last edited this file.
- "F1" to "F6" are follow-ups listed in the NOR-389 pull request body; their Linear tickets are filed by the owner's coordinator.

## Table 1: every part of `AGENTS.md`

| Ours | Section or rule | Verdict | What changed and why |
| --- | --- | --- | --- |
| 1-3 | Title; what the repo is | ADAPT | This repo's description from `README.md` (a mutual aid protocol for agents; a Worker on Hono over D1, KV and R2; cron), the fork facts (`wally-kroeker/mycelia`, MIT, `ATTRIBUTION.md`, the `upstream` remote), and the owner/agent split: the owner picks the work, an agent carries it to an open pull request (NOR-381). |
| 5 | The Worker here is the live bus; trust rules are behaviour | OURS | `wrangler.toml` sets `MODE = "fleet"` for the production Worker; changes to `src/`, `migrations/`, `wrangler.toml` reach every agent once deployed. The mode matrix is in `src/middleware/fleet-gate.ts`, the audited findings in `docs/KNOWN-ISSUES.md`. |
| 7-11 | Rules here, procedures in skills; pointer to this file | KEEP | Marker added: `.claude/` is in this repo's `.gitignore`, so no skill can be committed until that line changes. |
| 13-15 | Skills index | ADAPT | No skills exist here; the rule that a change adding a skill adds its row kept. |
| 17-20 | Development setup | ADAPT | The source's runner rule kept (owner, 2026-11-14: use the source's runner). This repo's runtimes: Bun for installs and scripts (CI pins `1.3.6`, the value its `ci.yml` had), tests under Node via Vitest, `bun run build` the dry-run bundle; better-sqlite3's install script; `bun.lock` is the lockfile and `package-lock.json` is stale (F4). |
| 22-24 | Dependency placement: `overrides` | KEEP | |
| 26-31 | Dependency updates are issue-driven; alerts; read-back | ADAPT | Marker: no sweeps here; the Dependabot settings were not read, because repository settings are the owner's. |
| 32 | Actions pinned by SHA; here, every job | ADAPT | The source's rule covers credentialed jobs; here every job, because the checked commit is the one the owner deploys as the Worker. `npm run verify:action-pins` enforces it. |
| 34-46 | The upstream watch and the sweep rules | ADAPT | Upstreams are this repo's: the fork parent, Hono, and the source's rules files. Marker: no sweeps yet. The sweep rules themselves are kept. |
| 48-50 | The owner picks; an agent opens; the owner merges | ADAPT | For this public repo the owner's NOR-381 scope is "Private + public as open PRs", so an agent leaves the pull request open. |
| 52 | Every PR must reference an issue | ADAPT | Linear `NOR-<NUMBER>`; one form added for a child of a larger effort. |
| 54 | Protocol changes are specs first | OURS | This repo's existing OpenSpec process (`README.md`, Contributing; `openspec/`). |
| 56 | Nothing is opened against the fork parent | OURS | `ATTRIBUTION.md` ("Contributing Back") and the owner-only "Anything public or sent to other people", applied to the `upstream` remote. |
| 58-70 | Project Status and Direction; branching | ADAPT | Develop is `main`; the release branch is what is deployed as the Worker, name not yet set. Repo: `NorthwoodsSentinel/mycelia` (public fork). |
| 72-81 | Keep documentation files up to date | KEEP | The header-comment rule keeps the source's "new and touched files only" form. |
| 82 | Keep the credit | OURS | NOR-381: keep `ATTRIBUTION.md`, `LICENSE` and upstream credit intact; copied files keep their provenance headers. |
| 84-95 | Maintaining the skills | ADAPT | Marker on rule 1: the `verify:skills` guard comes in with the first skill. Rules 2-4 kept; running eval cases spends model calls, not yet set by the owner. |
| 97-114 | Issue-driven Work Style | ADAPT | The owner's rulings: Linear as the board; one process label (name not yet set); `Backlog`/`Todo` as filed/approved; Priority by rubric or the owner; `Done` means shipped; worktrees; signed-off commits with `DCO` (the source's merge and bot-author exemptions kept, stated on line 111); Codex review loop with the source's stop rule; pacing of GitHub writes. |
| 115 | Scan the diff before every push | OURS | NOR-381's limit "Personal-data scan before every push"; this repo is public and history is never rewritten. |
| 117-125 | Responding to Code Reviews | KEEP | |
| 127-133 | Always test new or modified code | ADAPT | The bar (90 on four dimensions, per file) and the owner's default kept. This repo's facts: one Vitest suite; eleven files under the bar, six by new tests; nineteen excluded under F3. The scope check is `scripts/verify-coverage-scope.mjs`. |
| 135-146 | Test-gate timeouts | KEEP | |
| 148-154 | Mandatory pre-push gate | ADAPT | This repo's stages; no `smoke` stage, with the reason (an HTTP API Worker, not an MCP server). `local:dco` stays local for the source's reason (CI's shallow checkout has no `origin/main`). |
| 156-167 | Waiting on long-running work | KEEP | |
| 169-175 | Build output is never a gate target | ADAPT | This repo's build outputs (`dist/`, `.wrangler/`, `coverage/`), and the exception for existing files by exact path (F1 format, F2 lint, F3 coverage). |
| 177-182 | Lint has no warning tier | KEEP | |
| 184-198 | TypeScript instructions | ADAPT | Recorded exceptions are this repo's: the shell scripts in `scripts/`, the upstream Discord bot in Python, the `.mjs` guards. The source's React and web rules left out (no UI). |
| 200-208 | Cloudflare work | OURS | The source has no Worker. A deploy is the owner's act; applying a migration is a deploy; bindings by name only; check Cloudflare's documentation; local and deployed results kept apart. |
| 210-221 | Only the owner does | ADAPT | The owner's standing list, plus this repo's: migrations and live D1/KV; merging here (NOR-381); anything sent to the fork parent. |

## Table 2: what was not brought over

The source's project structure, dependency placement across its five installs, web layout, React and Mantine rules, the web auth token, screenshots for UI changes, the version label and the maintainers-only pull request rule: not applicable to a repo with no UI, one install and one owner (owner's rulings, 2026-11-14).
