<!--
CLAUDE.md: points Claude Code at AGENTS.md, which holds this repo's rules.
Claude Code reads AGENTS.md on its own only when no CLAUDE.md or
CLAUDE.local.md sits in the working directory or above it, so a session
started below a parent CLAUDE.md would skip the rules without this import
(https://code.claude.com/docs/en/memory). Private per-project instructions go
in CLAUDE.local.md, which is gitignored. Block HTML comments are stripped
before this file enters context, so only the import below is loaded.
-->
@./AGENTS.md
