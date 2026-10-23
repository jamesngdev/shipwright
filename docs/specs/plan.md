# Shipwright Implementation Plan

**Goal:** Build the `sw` Claude Code plugin (marketplace `shipwright`) described in `design.md`.
**Root:** `/Users/trinv/Work/Personal/be-kit/shipwright/`
**Tech:** Markdown skills/agents, Node 22 CommonJS scripts (no deps), `node:test` for tests, bash installer.

## File map

```
shipwright/
  .claude-plugin/{plugin.json, marketplace.json}
  hooks/hooks.json
  bin/                         # copied to ~/.claude/shipwright/bin by installer + session-start self-heal
    lib/{config.cjs, state.cjs, git.cjs}
    session-start.cjs  guard-bash.cjs  guard-read.cjs
    wt.cjs                     # worktree + env + DB + Redis + port
    auth-bypass.cjs            # save/restore/check @sw-auth-bypass patches
    statusline.cjs
  skills/<name>/SKILL.md (+ references/, scripts/)
  agents/sw-*.md
  tests/*.test.cjs
  install.sh  uninstall.sh  README.md
```

## Tasks

- [x] **T1 Scaffold** — plugin.json (`name: "sw"`), marketplace.json (`shipwright`), README.
- [x] **T2 Shared lib** — `config.cjs` (global config `~/.claude/shipwright/config.json`, defaults: pg localhost:5432 postgres/postgres, redis localhost:6379, logsMcp null), `state.cjs` (`.sw-state.json` read/write: slug, size, stage, round, db, port, base), `git.cjs` (exec helpers, repo root, common dir, base branch detection).
- [x] **T3 Hooks** — `session-start.cjs` (≤1KB bootstrap; self-heal bin copy when plugin version changes), `guard-read.cjs` (block heavy dirs + secret files for Read/Grep/Glob), `guard-bash.cjs` (block `cat .env`-style reads, block `git commit|push` while `@sw-auth-bypass` exists). Tests: block/allow matrix.
- [x] **T4 wt.cjs** — `create <slug> [--prefix feat] [--base B]`, `remove <slug>`, `list`, `info`. APFS `cp -cR` for node_modules (fallback symlink/install hint), env subset copy + rewrite (DATABASE_URL, PORT, REDIS_URL/REDIS_DB/REDIS_PREFIX), DB clone (size >100MB → schema-only flag for caller to migrate+seed; else `pg_dump -Fc | pg_restore`), Redis db index allocation, `.worktree/` gitignore, state file. Remove drops DB + flushes Redis db. Tests against a temp repo + real local Postgres.
- [x] **T5 auth-bypass.cjs** — `start` (record files), `check` (exit 1 if marker present), `restore` (git checkout marked hunks / saved originals, verify clean).
- [x] **T6 statusline.cjs** — two-line layout from design §9, <50ms, 5s git cache. Test with fixture JSON.
- [x] **T7 Core skills** — using-shipwright, ship, setup, init, discover, architect, plan, worktree, build, debug, verify, review, llms-txt (+ generalized scripts), pr, verify-dev, cleanup. Descriptions ≤ ~200 chars each.
- [x] **T8 Domain packs** (parallel subagent) — node-backend, go, frontend + review lenses (security, performance).
- [x] **T9 Agents** — sw-scout, sw-researcher, sw-implementer, sw-spec-checker, sw-verifier, sw-debugger, sw-docs-writer, sw-reviewer (model pinned).
- [x] **T10 Installer** — install.sh / uninstall.sh: copy bin, write config, CLAUDE.md managed block with backup (asks before removing superseded sections), statusLine setting with backup, `claude plugin marketplace add` + `install`. Test in sandbox `HOME`.
- [x] **T11 Verify** — all `node --test`, `claude plugin validate`, token budget check (description sizes), installer sandbox run, wt end-to-end on real Postgres/Redis.

## Rulings
- Ruling: plugin name `sw` (not `shipwright`) — namespace gives `/sw:<skill>` as agreed — cost if wrong: rename one field.
- Ruling: new `wt.cjs` (~400 lines) instead of extending claudekit's 916-line monorepo/superproject script; borrows its env-name safety + base detection — cost if wrong: monorepo sub-project worktrees need a follow-up.
- Ruling: DB source = main checkout's `DATABASE_URL` (projects run Postgres on different docker ports); global config is the fallback — cost if wrong: one flag.
- Ruling: scripts live at stable `~/.claude/shipwright/bin` so skills/statusline reference one path across plugin versions.
- Ruling: keep user's BE-Base worktree section in CLAUDE.md (repo-specific); installer only supersedes Post-Feature Auto-Chain, Feature Branch Hygiene, Branch & PR Base.
- Ruling: squash to 1–3 commits only before the first push (never force-push).
- Ruling: DB clone uses plain `pg_dump | psql` (filtering `SET transaction_timeout`) instead of `pg_dump -Fc | pg_restore` — local pg_dump 18 vs server 16 made pg_restore fail on new settings — cost if wrong: slightly slower restore on very large DBs (those take the schema-only path anyway).
- Ruling: `wt.cjs remove` refuses when the worktree has untracked (non-ignored) files, not just modified ones — they may be uncommitted work.
- Ruling: coverage gate ignores tests, DTOs, modules, migrations, config and `main.ts` (the "none" TDD tier).

## Status (2026-10-23)
All tasks built; `npm test` 18/18 (incl. real Postgres 16 + Redis worktree tests); `claude plugin validate` passes (only warning: no icon). Not yet installed into the real ~/.claude — awaiting user go-ahead.
