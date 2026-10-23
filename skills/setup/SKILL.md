---
name: setup
description: One-time global Shipwright setup — local Postgres/Redis connection defaults and which MCP reads environment logs. Use after installing the plugin or to change those settings.
---

# Setup (global, once per machine)

Config file: `~/.claude/shipwright/config.json` (helpers in `~/.claude/shipwright/bin/lib/config.cjs`).

1. Read the current config: `node -e "console.log(JSON.stringify(require(process.env.HOME+'/.claude/shipwright/bin/lib/config.cjs').load(),null,2))"`.
2. Ask with AskUserQuestion (one call, up to 4 questions), showing current values as the recommended option:
   - **Local Postgres** — host/port/user/password used when a repo's `DATABASE_URL` has no password (default `localhost:5432`, user `postgres`, no password).
   - **Local Redis** — host/port/password (default `localhost:6379`, no password).
   - **Logs MCP** — which MCP server reads dev/staging logs during `/sw:verify-dev`. List the MCP servers available in this session (names like `mcp__<server>__*`) as options, plus "None — report only".
   - **Default base branch** when a repo has no clear release branch (default `master`).
3. Write the merged config with `save()` from `config.cjs`. Never store production credentials here.
4. Check tools and report what is missing with the install command: `psql`, `pg_dump`, `redis-cli`, `gh` (and `gh auth status`), `node`, `npx playwright --version` (frontend only).
5. If `~/.claude/CLAUDE.md` has no `<!-- shipwright:start -->` block, or the statusline is not Shipwright's, offer (one AskUserQuestion, multi-select) to install them — both back up first and are reverted by `uninstall.sh`:
   - CLAUDE.md block: `node ~/.claude/shipwright/bin/install-lib.cjs claude-md install` (add `--supersede` only if the user agrees to move out sections Shipwright replaces: Post-Feature Auto-Chain, Feature Branch Hygiene, Branch & PR Base).
   - Statusline: `node ~/.claude/shipwright/bin/install-lib.cjs statusline install`.
6. Print the final config (mask passwords).
