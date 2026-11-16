# mycelia

mycelia is a mutual aid protocol for AI agents, and this repository is the reference node: a Cloudflare Worker (`src/index.ts`, Hono) over D1, KV and an optional R2 audit bucket, with a cron trigger for expiry and trust decay. Agents register, post help requests, claim them, respond and rate each other; trust is a Wilson score per capability. There is no UI and no published package. This repo is a fork of [`wally-kroeker/mycelia`](https://github.com/wally-kroeker/mycelia) (MIT; see [`ATTRIBUTION.md`](./ATTRIBUTION.md) and [`LICENSE`](./LICENSE)), adapted for a personal fleet; the `upstream` remote is that original. The owner picks what gets worked on; agents carry it through to an open pull request.

**The Worker configured here (`wrangler.toml`, `MODE = "fleet"`) is the owner's live fleet message bus.** A change to `src/`, `migrations/` or `wrangler.toml` changes what every agent on the bus sees once it is deployed, and deploying it is the release (see [Cloudflare work](#cloudflare-work-ours)). The protocol's own trust and safety rules (`src/middleware/fleet-gate.ts` has the mode matrix; `docs/KNOWN-ISSUES.md` has the audited findings) are behaviour, so a change to them is a protocol change, not a tidy-up.

**This file holds the _rules_: the conventions a reviewer cites against a diff.** It is loaded in full on every turn, so it stays resident and must stay complete enough to work from on its own.

**The repo's _procedures_ — multi-step recipes with commands and live IDs — live in `.claude/skills/`.** They are ordinary committed Markdown, so any agent or human can read one directly; Claude Code loads them on demand and users invoke them by name. [Not yet in this repo: `.claude/` is in `.gitignore`, so the first skill also changes that line.]

Where each rule below came from, line by line, is in [`PROVENANCE.md`](./PROVENANCE.md).

## Skills index

No skills exist in this repo yet. A change that adds a skill under `.claude/skills/<name>/SKILL.md` adds its row to this table (columns: Skill, Covers, How it loads) in the same change, and the table never lists a skill that does not exist.

## Development setup

- **Use the Inspector's runner (`npx`, its `npm run` scripts) when running its tools or its procedures.** Where its way and ours differ, its way is the default; a departure needs a stated reason.
- **This repo's own code runs on Bun for installs and scripts, and its tests run under Node** (CI pins Bun `1.3.6` and Node `22.x`, `.github/workflows/main.yml`). `bun install --frozen-lockfile` (it runs better-sqlite3's native build, the one `trustedDependencies` entry, which the integration tests' D1 adapter needs), then `bun run test` (Vitest) and `bun run build` (a `wrangler deploy --dry-run` bundle into `dist/`; no deploy, no credentials). `bun.lock` is the lockfile; `package-lock.json` is stale (follow-up F4 in the NOR-389 pull request).

## Dependency placement

- **Pin a transitive dependency with an `overrides` entry**, not with `npm audit fix` — which "resolves" an advisory with no upward escape by silently downgrading.

### Dependency updates are issue-driven, like everything else

**Dependabot opens no pull requests against this repo — neither version updates nor security updates.** A Dependabot PR carries no `Closes NOR-<NUMBER>` and no ticket, so it would be the one standing exception to [Issue-driven Work Style](#issue-driven-work-style), enforced by nothing. Both halves are replaced by scheduled workflows that file **issues**, and the fix is written by hand. [No sweeps yet in this repo; the Dependabot settings were not read for NOR-389: repository settings are the owner's.]

- **Dependabot _alerts_ stay on.** Alerts and security-update PRs are independent settings; only the PRs are off. Turning alerts off would blind the sweep that replaced them.
- **A setting that can be re-enabled from the UI without a commit is read back by the sweep**, because nothing in the repo would record it. The sweep **fails loudly** on the wrong value. ⚠️ It is a _conditional_ guard, not an invariant: where the sweep's token cannot read the setting, it logs **UNVERIFIED** and carries on rather than going red every day for an unrelated reason.
- **Actions stay on moving major tags, except in a job that holds a credential.** A job holding `id-token: write`, `packages: write`, any secret other than `GITHUB_TOKEN`, or building an artifact such a job downloads runs only actions pinned to a **commit SHA with an exact `# vX.Y.Z` comment** — a tag is mutable, so whoever can move it replaces the code running next to the credential. The comment is not decoration: resolve the SHA and the exact release from the **same** tag lookup when bumping. **In this repo the pin is required in every job, credentialed or not:** the checked commit is the one the owner then deploys as the Worker, so the workflow vouches for code that runs with the Worker's bindings, and a guard limited to credentialed jobs would check none. `npm run verify:action-pins` enforces it, inside `validate`.

### The upstream watch is the third sweep

**A scheduled watch files one issue per upstream release we are behind.** For this repo the upstreams are the fork parent (`wally-kroeker/mycelia`, the `upstream` remote), Hono (the one runtime dependency, `package.json`), and the Inspector's own rules and procedure files, the source this file was built from. It obeys the same rule as the two above: **it files an issue, never a PR.** [No sweeps yet in this repo.]

- **It never closes an issue either.** A further release files its own issue and leaves a **supersession comment** on the older one. An issue closed for the same target keeps suppressing it, so a "not planned" is not re-argued nightly.
- **"An issue exists" and "the issue was analyzed" are different claims**, and the sweep must not equate them.
- ⚠️ **Upstream release notes are untrusted input to a job that runs a model, and the model is granted nothing that can write anywhere.** The tool whitelist is the only real control — the prompt's prose constraints are not.
- **The general rule: a prefix grant constrains the command, never its flags. Check what flags a command accepts — especially any that take a path or a URL — before granting it.**
- ⚠️ **Permissions are scoped per JOB, not per step**, so a job that runs a model cannot also hold the write scope its posting step needs — the token reaches the model regardless of how carefully the step is written. **The invariant is "no model runs in a write-capable job", not "only one job can write".**
- ⚠️ **`--tools` restricts what is available; `--allowedTools` only pre-approves.** They are not interchangeable and the difference is a security boundary, not a nicety — a tool some other settings file or plugin already permits stays reachable when only `--allowedTools` names it.
- ⚠️ **The model gets no `Bash` at all.** Every command grant turned out to have a wider flag surface than the grant looked, and a `Bash(...)` rule can match a **compound** command besides. So untrusted input is **prefetched by a deterministic step** and the model only reads files. When a grant keeps needing narrowing, take the capability away instead.
- ⚠️ **A marker is not evidence.** An issue or a comment can be written whose body starts with any string, and every marker here drives automation. So the sweep trusts a marker **only** on something the automation wrote.
- ⚠️ **A channel left open is accepted deliberately rather than closed, and in writing.** What makes that acceptable is the threat model, not the controls — and the record says so. **That assessment is what to re-open if the inputs change.**

## Contributing

**The owner picks the work; an agent carries it through to an open pull request, and the owner merges.** This repo is public, and the owner's scope ruling for it is "Private + public as open PRs" (NOR-381): an agent opens the pull request, runs the gate and the Codex review, and leaves it open. The fleet rule that lets an agent merge its own pull request (owner 2026-11-15) applies to the private repos, not here.

**Every PR must reference an issue. No exceptions, regardless of who opens it.** The PR body's first line is `Closes NOR-<NUMBER>` (see the [Issue-driven Work Style](#issue-driven-work-style) rules below), or `Part of NOR-<PARENT> — NOR-<NUMBER>` when the issue is a child of a larger effort. A PR with no linked issue has no ticket, so the work is invisible in Linear and untracked — if you're about to open one and there's no issue yet, create the issue first. This holds for a one-line fix as much as for a feature.

**Protocol changes are proposed before they are built.** This repo's own process, kept from before these rules: a change to the protocol is a structured spec in `openspec/changes/` first (`README.md`, Contributing).

**Nothing is opened against the fork parent.** A pull request, issue or comment on `wally-kroeker/mycelia` is public and sent to another person, so it is the owner's act (see [Only the owner does](#only-the-owner-does)). `ATTRIBUTION.md` says changes that improve the core protocol should go back upstream; deciding which, and sending them, is the owner's.

## Project Status and Direction

Two branches, two distinct roles. Target the one matching the work; **never open a PR against the release branch**.

| Branch                                      | Role                                                                                                               | PRs target it?                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Develop: `main` (the repo's default branch) | **Develop.** All active work is merged here.                                                                       | **Yes** — every PR                                       |
| Release (name not yet set by the owner)     | **Release.** Holds only what is released; for this repo, what is deployed as the Worker. Not a development branch. | **No** — it only receives merges from the develop branch |

- **Repo**: `NorthwoodsSentinel/mycelia` (public; a GitHub fork of `wally-kroeker/mycelia`)
- **Issue tracker**: Linear, team key `NOR`

A corollary for **branching**: cut feature branches from the **develop branch**, never from the release branch.

## Maintenance Rules

### Keep documentation files up to date

- When adding, removing, renaming, or changing the purpose of any file or folder, update the corresponding entry in the main README.md
- When the structure of the project, the tech stack, or the developer setup changes, update the appropriate README.md files with the details.
- When adding new commands, dependencies, or architectural patterns, update the relevant sections of the appropriate README.md files as well.
- When rules for implementation and testing change, update this file, AGENTS.md, and the matching row of `PROVENANCE.md`.
- **When a _procedure_ changes, update the skill that owns it — not this file.** Rules live here; recipes live in `.claude/skills/`. Two copies of a board ID or a command sequence is strictly worse than one, because the stale copy is indistinguishable from the live one.
- **Every file here carries a header comment explaining its own purpose and the reasoning behind it.** Read the source rather than looking for a second copy of that reasoning in this file — a duplicated rationale is one that goes stale silently. This applies to new files and to files a change touches; there is no bulk migration of existing files (the source's own adaptation for its second repo).
- **Keep the credit.** `ATTRIBUTION.md`, `LICENSE` and the `upstream` remote stay as they are, and a file copied from another project keeps the header naming where it came from and under what licence.

### Maintaining the skills

Skills are conditional — a skill's body loads only when it is invoked — so a skill that stops being reachable loses behavior **silently**. Four rules keep that from happening:

1. **`npm run verify:skills` must pass**, and it runs inside the gate. It fails on anything that would strip a skill's metadata — most importantly **malformed YAML**, which loads the body with an _empty_ description, so `/skill-name` still works and a manual spot check passes while the skill can never auto-fire again. **Quote any description containing `#` or `:`.** [Not yet in this repo: the guard comes in with the first skill.]
2. **Every skill declares its invocation mode explicitly.** `disable-model-invocation` is **required** on every skill (`true` = reachable only by name, `false` = the model may fire it). **Default to `false`.** ⚠️ **A `true` skill cannot be reached by another skill either.**
3. **A model-invoked skill carries committed eval cases** at `evals/evals.json` — positives **and negatives**. Seeing a skill fire once tells you Claude found it, not that it finds it reliably, and a skill that fires on everything is a context regression that nobody notices by hand. Running the cases spends metered model calls; that spending is not yet set by the owner.
4. **Re-check the listing budget when adding a skill.** Claude Code loads a listing of every skill's name and description into context, truncates it when it overflows, and drops the least-invoked entries **first** — which are exactly the model-invoked skills that must fire on their own. **Put the key use case first.**

**If a convention lived solely in a skill body it could vanish mid-session, in exactly the long tasks where it matters most** — which is why rules stay here.

⚠️ Skills in nested `.claude/skills/` directories below the working directory do **not** load at startup. Keep everything in the repo-root `.claude/skills/`.

## Issue-driven Work Style

All work is driven by tickets in Linear (team key `NOR`). The _recipes_ for the flows below will be skills [Not yet skills in this repo]; the rules are here.

- **Before starting work, check Linear for the relevant ticket.**
- **Every item of work is a real Linear issue.** Before creating a new issue, check Linear for a matching item — **never create a duplicate**.
  - **The one exception is a privately reported vulnerability**, which is tracked privately until the reviewed fix is ready, because a real issue would disclose the vulnerability before a fix exists. **Accepting and publishing an advisory are outward-facing and stay human-gated; never automate or bulk-apply either.**
- **Only issues are tickets — never PRs.** A PR is tracked through its linked issue (via `Closes NOR-<NUMBER>`), not its own ticket.
- **Label work run through this process — every issue and every PR, no exceptions.** Exactly one label marks an issue or PR as tracked by this process; the label's name is not yet set by the owner. Set it at **create time**, never by backfilling.
- **Label by type — exactly one of `bug` / `enhancement` / `documentation` / `chore` / `question`** on every issue you create or triage. The process label says the work is tracked by this process; the type label says what kind of work it is, and the two are independent. Don't force the binary: pressing a docs task or a dependency pin into `enhancement` degrades it to "not a bug", at which point filtering by it stops telling you anything. A **PR** needs no type label — it is classified through the issue it closes.
- **`Backlog` ⇔ filed, not approved; `Todo` ⇔ approved by the owner.** Moving a ticket into `Todo` _is_ the approval act. The owner does it for new work; an agent may do it for a follow-up it filed inside work the owner already approved (fleet rule, owner 2026-11-15: "We need to make you the one who makes the call"). `Todo` asserts the owner signed off, so never park an unreviewed issue there — that erases the distinction and quietly promotes unreviewed work into the queue. **An agent starts work only on a ticket that is in `Todo`.**
- **Every ticket has a Priority.** Derive it with a rubric rather than asserting it. No rubric exists yet in this repo; until one does, the owner sets Priority or it stays unset. An agent does not assert one.
- **`Done` means the work shipped.** Exactly two things earn a ticket a place in Done: its **PR merged**, or it is a **parent whose last sub-issue closed**. Anything else — duplicate, won't fix, not planned, obsolete, superseded — means nothing shipped, so it does not go to Done. Done is read as the record of what was actually delivered; a duplicate sitting there makes that record wrong in a way nobody can detect later. In Linear such a ticket is set to `Canceled` or `Duplicate`, never `Done`.
- **When work begins**, assign the issue to yourself, set Status to **In Progress**, and create the feature branch **in a new git worktree** — never by switching branches in the primary checkout, which concurrent agent sessions share; remove the worktree once the PR merges. Start the session in that worktree, or open this file first and say so: the rules load only from the directory a session starts in.
- **When work is complete**, run `npm run format` then `npm run local:gate`, **sign off every commit** (`git commit -s` — the repo-owned sign-off check fails a PR on any unsigned commit with no partial credit (`.github/workflows/dco.yml`, job `DCO`); it gates merges as a **required** status check, set by a repository ruleset [Not yet in this repo: setting it is the owner's act]; a PR showing the check as missing or "expected" is an outage, not a pass), open a PR against the develop branch with **`Closes NOR-<NUMBER>` as the body's first line**, and set Status to **In Review**.
- **After opening a PR, run a Codex review loop to exhaustion — unprompted.** Codex runs through the `codex-review` wrapper. Request a review, wait for the round to post _or_ for Codex's session to end without one, answer every comment, and request again whenever a fix was pushed. Stop on the **first** clean round (no confirming round "just to be sure"), a round holding only out-of-scope findings, or two rounds in a row where Codex's session ends without posting. **Weigh each finding against the issue the PR closes and decline scope expansion** — pre-existing behavior, new capabilities, and hardening the issue did not ask for — because that is what turns a review cycle into overbuilding.
- **If new tasks are discovered during development, create issues** in Linear. They arrive in `Backlog`.
- **Pace bulk GitHub writes: 1 s between requests, never in parallel, under 80 a minute and 500 an hour.** The secondary limit refuses while `gh api rate_limit` still shows quota, and most `gh` writes are GraphQL. After a refusal, wait out `retry-after`, or a minute without one; a refused create can still go through, so look before retrying.
- **Before every push, scan the diff for personal data and secrets.** This repo is public: every changed file is checked for names, addresses, account and agent identifiers and key-shaped strings, and a hit that is not a placeholder stops the push. A pushed commit cannot be taken back without rewriting history, which this repo does not do.

### Responding to Code Reviews

When asked to respond to a code review of a PR:

- it is not necessary to implement all suggestions
- **judge each suggestion against the issue the PR closes.** Fix defects in what the PR added; decline, with a reason, suggestions that expand the PR beyond what the issue calls for, and file an issue for any that is worth doing on its own
- you are free to implement suggestions in a different way, or to ignore one if there is a good reason
- after making the changes, respond to each review comment with what was done (or why it was ignored)
- **that response goes in the review comment's own thread — a rollup comment does not discharge it.** Each review comment is a discussion thread with its own resolve state, so a bullet posted elsewhere on the page cannot be connected back to the thread it answers: the thread stays open showing a finding and no reply, and the PR reads as though the review were ignored. Replying does not itself **resolve** a thread — that is a separate act and the reviewer's to make — but it is what makes resolving it defensible. Reply inline first, per comment; then post the PR-level summary **in addition**, because inline replies go hidden once the fix is pushed.

## Always test new or modified code

- **Ensure all code has corresponding tests.** New code must clear a stated coverage bar per file, and **CI enforces it**: a PR that drops any file below the bar fails. The bar is the source's: **≥ 90 on all four dimensions — lines, statements, functions, and branches** (the owner's default of 2026-11-14: the source's way stands until there is a reason to depart). `npm run coverage` enforces it with the source's tool (Vitest and its V8 coverage, 4.1.12). NOR-389 put eleven files under the bar (five by new tests beside them); nineteen existing files remain excluded by exact path under follow-up F3.
- **A genuinely-unreachable branch is annotated at the source, never waved through by lowering the gate.** Use a justified ignore annotation that carries its reason. Acceptable reason: a provably-dead defensive guard (a `?? fallback` for a value the types guarantee non-null). Reach for it only when the branch is genuinely impossible to exercise.
- **In unit tests that expect error output, suppress it from the console.**
- **Keep a test file's exact filename.** A runner can silently _skip_ a file its glob misses and still exit 0 (the source's case: `node --test`).
- **A coverage `include` is a whitelist.** A module placed **outside** the directories it names falls out of the gate entirely, silently. Place new modules inside a gated directory. The converse — the run measuring **fewer** files than the `include` declares (the source's case: 418 → 11, still green) — must not be silent: a scope check fails naming each missing file. Fix that by fixing the globs, never by excusing the files. In this repo that check is `scripts/verify-coverage-scope.mjs`, the last step of `npm run coverage`; it also fails on any tracked TypeScript file the coverage declaration does not select and its exclusion lists do not name.

### Test-gate timeouts are chosen values, stated once

**Every wall-clock budget a test gate runs under is a value somebody picked, and it lives in one place.**

This is not a licence to relax the bar: **a test that races is fixed with fake timers or an awaited condition, never with headroom.**

- **A rule about what the code _does_ is asserted at runtime, not read out of the source.** Asking the runtime needs no spelling to be anticipated and covers cases the scan could not reach at all. Reach for a `verify:*` guard when the question is about **configuration**, which a tool can be asked to resolve; assert at runtime when it is about behavior.
- **A budget is stated, which is not the same as raised.** Measure before raising a budget that a passing test can spend in full.
- **An inner budget must be strictly smaller than the budget enclosing it.** When two bounds cover the same work they must differ, and the **inner** one — the one carrying the useful diagnostic — has to be the tighter, which is arranged by raising the outer rather than shrinking the inner.
- **`retry` stays unset.** A retry turns a load-induced red into a silent green on the only pre-push gate this repo has, and hides a real race behind a second attempt.
- **Every CI job declares `timeout-minutes`, sized from observed runs.** It is a hung-job guard, not a flake remedy, so the rule is roughly twice the slowest run observed, rounded up to the next five minutes, stated per job with the range it was read from.
- **Do not scale a fixed sleep.** A `setTimeout(r, N)` with no condition is not a timeout: it always waits the full window, so raising it slows every passing run and still races on a loaded one. Replace one with a condition wait when it actually flakes.

## Mandatory pre-push gate

The command names below are the source's. In this repo `validate` runs the pin guard, the guards' own tests (`test:scripts`), the format check, lint, the typecheck of both projects and its coverage guard, the Vitest tests and the dry-run build; `local:gate` is `validate`, then the local-only sign-off stage `local:dco`, then `coverage`. There is no `smoke` stage: this repo is an HTTP API Worker, not an MCP server, so the Inspector has nothing to connect to. CI runs every stage of `npm run local:gate` except `local:dco`, which is local-only; the pull request's commits are checked by the `DCO` workflow.

- **ALWAYS run `npm run format` before committing.** `validate` runs the non-fixing `format:check` and will fail in CI on any unformatted file, so run the auto-fixer first rather than letting `format:check` catch it.
- **`npm run local:gate` is the mandatory pre-push command.** It runs **every check** CI runs, plus one local-only step, so a green run here is the strongest predictor of a green CI this repo has: every check CI applies has already passed on your machine.
- **`npm run validate` is the fast inner-loop check and is NOT an acceptable substitute.** Skipping the gate is how a push passes every fast local check and still fails CI.

## Waiting on long-running work

**When you are waiting for something to finish, arm a notifier and stop. Never spend turns polling.** The harness re-invokes you when a backgrounded task exits, so a per-turn `echo ok`, or a per-turn `tail`/`grep` of a log, delivers nothing the notification would not have delivered anyway. It burns turns and tokens, it pushes the actual work further from the top of the context window in exactly the long sessions where that hurts most, and it buries the verdict under dozens of identical no-op turns so nobody reading back can find where the run actually ended.

Pick by how many notifications the wait needs:

- **One — "tell me when this finishes."** Background the command itself, or a single `until` loop that exits on the condition. The `local:gate` run and a Codex review round are both this shape.
- **Many — "tell me on each occurrence."** A `Monitor` over a stream that emits one line per event.

**The one genuine exception is state the harness cannot observe** — a CI run, a remote review queue, an external job. That does need polling. But the poll belongs **inside a single backgrounded loop that exits when the condition holds**, not spread one call per turn across the conversation. Set its interval from how fast the state actually changes: 30s or more for a remote API, and one check for an eight-minute CI run rather than eight.

⚠️ **If a notifier is already armed, that settles it — wait.** Re-checking by hand alongside a watcher that is watching the same condition is the polling this rule forbids, dressed as diligence.

## Build output is never a gate target

**No gate — lint, format, or typecheck — may read generated output.** The gated surface is first-party source only. Everything a build writes is out of scope, and each scope states this itself, in its own ignore list. In this repo the build writes `dist/` (the dry-run bundle) and `.wrangler/` (wrangler's state), and `npm run coverage` writes `coverage/`; all three are in `.gitignore`.

- **It reports defects nobody can fix.** A bundle vendors third-party code, so a rule that fires inside it names a problem in someone else's source.
- **It trains people to skim the channel.** A scope whose lint is never clean has no signal left in it, and the real warning added later arrives where everyone has learned to look past.
- **When a build starts writing to a new location, add it to that scope's ignore list in the same change.** The reverse also holds — never widen an ignore to silence a finding in first-party code, and never add a build directory to a tsconfig `include` to make a generated `.d.ts` resolve (import the source, or fix the build's types). [Exception, NOR-389, in the form fleet-mcp's NOR-355 took: existing first-party code is outside three gates by exact path, one line per file, each list citing its follow-up in the NOR-389 pull request. Format: the 49 existing files that failed the check when measured, in `.prettierignore` (F1). Lint: the 20 existing files with findings, in `eslint.config.mjs` (F2). Coverage: the 19 existing files below the bar, in `vitest.config.ts` and `scripts/verify-coverage-scope.mjs` (F3). Every file is in the typecheck. No other exclusion of first-party code is permitted.]

## Lint has no warning tier

**Every `lint` script runs with `--max-warnings 0`, so a warning fails `validate` exactly as an error does.** A channel nobody fails on is one people learn to skim.

- **Do not silence a finding to satisfy the gate.** A warning is now a defect to fix. If a rule genuinely must be waived on a line, use its inline disable comment **with a one-line justification** — the same standard this document sets for an ignore annotation and for `void` on a floating promise. Widening an ignore list or dropping a rule to make `lint` pass is not an acceptable fix.
- **A rule left at `warn` still reads wrong in an editor.** Prefer `error` for any rule you actually intend to enforce.

## Typescript instructions

- Use TypeScript for all new code. **Recorded exceptions:** the existing shell scripts under `scripts/`, the upstream reference Discord bot in Python (`network-management-examples/discord-bot/`), and the copied `.mjs` guards under `scripts/`, which run on Node without a build step as they do in the source.
- Follow TypeScript best practices and coding standards
- NEVER use 'any' as a type
- NEVER suppress error types (e.g., no-unused-vars, no-explicit-any) in the typescript or eslint configuration as a way of satisfying the linter or compiler.
- AVOID double casts (`as unknown as T`). They erase all type safety and usually signal that the real type is being worked around. Prefer a type guard, a narrower single `as` cast, or fixing the underlying type. When a double cast is genuinely unavoidable (e.g. a documented gap in a third-party type, or bridging a structurally-identical shape TS can't relate), it MUST carry an inline comment justifying why it is safe and why no better option exists — an unjustified `as unknown as` is not acceptable in review.
- Use type annotations and interfaces to improve code clarity and maintainability
- Use TypeScript's type inference and static analysis features for better code quality and refactoring
- Use type guards and type assertions to handle potential type mismatches and ensure type safety
- Take advantage of TypeScript's advanced features like generics, type aliases, and conditional types to write more expressive and reusable code
- Regularly review and refactor TypeScript code to ensure it remains well-structured and adheres to evolving best practices
- **NEVER leave a promise floating.** Every promise must be awaited, returned, terminated with `.catch(…)`, or explicitly discarded with the `void` operator.
  - **The class it catches is invisible at review time.** A floated call reads like an awaited one minus four characters, and the unhandled rejection it produces surfaces somewhere else entirely — a different test, a different file.
  - **Prefer holding and settling the promise.** `void` is an escape hatch, not a fix — it is visible at review time (strictly better than nothing) but still discards the rejection. Reach for it only when the callee already owns its failures (it ends in a `catch` that surfaces the message) or the caller genuinely cannot await. Say **which** of those it is in a one-line comment; an unexplained `void` is a review finding.

## Cloudflare work (OURS)

**OURS: none of this section comes from the Inspector or from walle.** The Inspector publishes an npm package and its release is a human publishing a GitHub Release; it has no Worker. These rules follow the source's shape where it has one: a human-gated release, a ledger, and evidence recorded per run. They cover the Worker configured in this repo: `wrangler.toml`'s production Worker (the live fleet bus, its D1 database, KV namespace, service bindings and cron trigger) and its `env.dev` block.

- **Deploying a Worker is the release, and it is the owner's act.** Only the owner runs a deploy or approves one, for that one deploy; every `wrangler deploy` counts, `bun run deploy` included. A deploy takes a commit on the release branch that passed the gate, never a feature branch. Its ledger records the commit, the config hash and the Worker version id that `wrangler` reports; the steps live in a name-only `release` skill, as the source's do. Nothing in this repo deploys from CI. [Ledger and `release` skill not yet in this repo.]
- **Applying a migration is a deploy.** `migrations/` changes the live D1 schema only when someone runs it against the database, and that is the owner's act, like a deploy. An agent writes a migration and its test; it never runs `wrangler d1 migrations apply`, `wrangler d1 execute` or any other command against D1 or KV.
- **Worker secrets, bindings, vars and routes are handled by name only, and their values never pass through a chat.** The owner sets them, never in a committed file and never in a command line an agent composes with the value in it. The repo holds an inventory of their **names** per deployment and who sets each, and the code reads no environment name the inventory does not list. Checking names on the live account is a read the owner approves, because it touches Cloudflare. [Inventory not yet in this repo. Today `src/types.ts` (`Env`) names the bindings and vars the code reads, and `.dev.vars.example` lists the local ones.]
- **Check Cloudflare's current documentation before writing Cloudflare code.** A design or PR that relies on a Cloudflare behavior (the Workers runtime, wrangler, custom domains, D1, KV, R2, cron triggers, secrets, compatibility dates and flags) cites the Cloudflare documentation page and the date it was read. Look it up; do not answer it from memory.
- **Local-runtime and deployed results are separate results, and each record names its target.** A test record states where it ran: in-process (Vitest on Node, with the better-sqlite3 D1 adapter), the local Worker runtime (`wrangler dev`, workerd), or the deployed Worker, named and with its version id. A local result is never reported as a deployed one. CI runs only the first; a check against the deployed Worker happens after a deploy, by the owner or with the owner's approval, and never from CI.

## Only the owner does

- Picking new work: a new direction or a new repo effort.
- Spending.
- Secrets.
- Repository settings.
- Deploying the Worker.
- Removing files from pai-shuttle.
- Anything public or sent to other people.
- Setting Worker bindings, vars and routes (see [Cloudflare work](#cloudflare-work-ours)).
- Any command against the live Cloudflare account, reads included.
- Applying a migration to D1, or any read or write of the live D1 database or KV namespace.
- Merging a pull request in this repo (it is public; NOR-381).
- Anything sent to the fork parent, `wally-kroeker/mycelia`: a pull request, an issue or a comment.
