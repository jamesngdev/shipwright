<div align="center">

<img src="assets/logo.svg" width="112" alt="Shipwright logo">

# Shipwright

**A research-first, test-driven workflow kit for Claude Code.**
It asks the hard architecture questions first, then works through to a verified pull request without stopping, and checks the change on dev after deploy.

[![CI](https://github.com/jamesngdev/shipwright/actions/workflows/ci.yml/badge.svg)](https://github.com/jamesngdev/shipwright/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-jamesngdev.github.io%2Fshipwright-0ea5e9?style=flat)](https://jamesngdev.github.io/shipwright/)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat&logo=anthropic&logoColor=white)](https://docs.claude.com/en/docs/claude-code/plugins)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e?style=flat)](LICENSE)
![Stack](https://img.shields.io/badge/NestJS·Prisma·Postgres·Redis·Go·React-555?style=flat)

[**Website & guide**](https://jamesngdev.github.io/shipwright/) · [Install](#install) · [The flow](#the-flow) · [Commands](#commands) · [Worktrees](#worktrees-with-their-own-database) · [Design](docs/specs/design.md)

</div>

---

## Why

AI coding sessions usually fail in one of two ways. Some charge ahead on assumptions. Others stop every two minutes to ask "should I continue?". Shipwright puts **all the questioning up front**, where answers are cheap, and gets them from a structured architecture interview backed by real research. After you approve the plan it **runs to the pull request without pausing**, with evidence at every step: tests written first, a coverage gate, a real dev-server API smoke test, a Playwright run and a senior review.

It merges the discipline of [obra/superpowers](https://github.com/obra/superpowers) (brainstorm → plan → subagent TDD → verification) with the practical tooling of ClaudeKit (hooks, worktree scripts, plan red-teaming). It then adds what both of them lack: isolated databases per worktree, API smoke tests against a running server, post-deploy checks and an `llms.txt` sync. It is also built for **token efficiency**.

| | Typical kit | **Shipwright** |
|---|---|---|
| Per-prompt context injection | ~3 KB every message | **0** |
| Always-loaded skill + agent descriptions | ~27 K chars | **~4.4 K chars** |
| Mandatory subagents per task | 5–6 | **0 (tiny) · 2 (small)** |
| Approval gates | every step | **2 (design, plan)** |
| Worktree DB / Redis isolation | — | **✓ cloned per worktree** |
| Real API smoke test + post-deploy check | — | **✓** |

## Install

```bash
# one step (Claude Code ≥ 2.1.275)
claude plugin install sw --marketplace jamesngdev/shipwright
```
Restart Claude Code, then:
```text
/sw:setup     # once per machine — local Postgres/Redis, logs MCP, optional statusline + CLAUDE.md block
/sw:init      # once per repo — dev/prod domains, dev test auth → CLAUDE.local.md (git-ignored)
```

<details>
<summary>Full install from a clone (statusline, CLAUDE.md block, everything in one go)</summary>

```bash
git clone https://github.com/jamesngdev/shipwright && cd shipwright
./install.sh          # --yes, --no-plugin, --no-statusline, --keep-claude-md-sections
./uninstall.sh        # reverts it all; backups live in ~/.claude/backups/
```
</details>

**Requirements:** Node ≥ 20, `git`, `gh` (authenticated). For database isolation: `psql`/`pg_dump` and `redis-cli`. For frontend checks: Playwright.

## The flow

```text
/sw:ship "add partial refunds to orders"

 triage ── tiny ──► branch in place → edit → quick verify → llms.txt → PR
        └─ small / large
             1 discover     code map (+ docs, best practices, prior art for large)
             2 architect ⛔  one-question-at-a-time interview → 2–3 approaches → design.md
                            (+ threat model for large / security-sensitive tasks)
             3 plan      ⛔  file map + test-first tasks (+ red-team for large)
             ─── approved: runs continuously from here ───
             4 worktree     .worktree/feat-<slug> + own DB, Redis db, port
             5 build        tiered TDD · inline (small) or 1 subagent per task (large)
             6 verify       lint → typecheck → unit → integration → coverage ≥ 80%
                            → build → dev server → API smoke → Playwright
             7 review       one Opus whole-branch review (+ security / performance lenses)
             8 llms-txt     client-facing docs synced (every feature)
             9 pr           1–3 commits · PR → base (kept open) + PR → develop
            10 verify-dev   after merge + your "deployed": smoke on the dev domain, logs on failure
            11 cleanup      drop worktree, DB and Redis db
```

After the plan is approved, Shipwright stops only for the following:
- destructive operations;
- security-sensitive actions;
- side effects outside the worktree (merge, push to shared branches, deploy);
- a plan so broken that every way forward is a guess;
- verification still failing after its retry budget runs out.

Every other decision is made on the spot and logged in `plan.md` as `Ruling: <decision> — <why> — <cost if wrong>`.

## Commands

| Command | Purpose |
|---|---|
| `/sw:ship <task>` | The whole flow. `--tiny` / `--small` / `--large` to force a size, `--resume` to continue |
| `/sw:discover` | Code map + parallel research (context7 docs, web, `gh search code`) → `research.md` |
| `/sw:architect` | Architecture interview: data model, API contract, consistency, idempotency, concurrency, cache, authz, failure modes, performance, observability, rollout → `design.md` |
| `/sw:plan` | Exact files, signatures and named tests per task; red-team for large plans → `plan.md` |
| `/sw:worktree` · `/sw:cleanup` | Isolated workspace with its own DB/Redis/port · teardown |
| `/sw:build` | Tiered TDD execution (inline or `sw-implementer` + `sw-spec-checker` per task) |
| `/sw:debug` | Root cause first: reproduce → trace → one hypothesis at a time → failing test → fix |
| `/sw:verify` | The local gate, with a temporary, guarded auth bypass for smoke tests |
| `/sw:review` | `sw-reviewer` (Opus) against design + plan; how to receive feedback |
| `/sw:llms-txt` | Sync `llms.txt` + topic files ([llmstxt.org](https://llmstxt.org)); `audit` mode for drift |
| `/sw:pr` | Squash, SSH identity, dual PR, integration branch on conflict |
| `/sw:verify-dev` | Post-deploy smoke on dev; feature bugs are auto-fixed for up to 2 rounds |
| `/sw:node-backend` · `/sw:go` · `/sw:frontend` | Stack knowledge packs, loaded only when relevant |

**Agents** (models pinned): `sw-scout` and `sw-researcher` (Haiku) · `sw-implementer`, `sw-spec-checker`, `sw-verifier`, `sw-debugger` and `sw-docs-writer` (Sonnet) · `sw-reviewer` (Opus).

## Tiered TDD

| Tier | Applies to | Rule |
|---|---|---|
| **test-first** | domain/service logic, **every bug fix** | failing test → see it fail → minimal code → green |
| **integration** | endpoints / handlers | real request → real (worktree) DB → response, success + every documented error |
| **none** | config, DTOs, wiring, migrations | no test-first, but covered by integration tests |

Unit tests mock repositories; integration tests never mock the DB. `coverage-changed.cjs` enforces ≥ 80 % line coverage **on the files this branch changed** (lcov or Go cover profiles).

## Worktrees with their own database

```bash
node ~/.claude/shipwright/bin/wt.cjs create order-refund --prefix feat
```
- `.worktree/feat-order-refund` is created from the base branch and **never from `develop`**. `.worktree/` is added to `.gitignore`.
- **`node_modules` is APFS-cloned.** The copy is instant and copy-on-write, so `prisma generate` in the worktree can't corrupt the main checkout's client. Without APFS it falls back to a reflink copy, then to a symlink.
- **Only the env files a worktree needs are copied:** `.env`, `.env.local`, `.env.development*`, `.env.test*`. Production files are never copied.
- **The database is cloned from your `DATABASE_URL`** into `<db>_wt_order_refund`. A source of 100 MB or less is copied in full; a larger one gets its schema plus migration history, then your seed runs.
- **An empty Redis db index and a free `PORT` are allocated,** and the env files are rewritten to use them.
- `/sw:cleanup` drops the DB, flushes the Redis db and removes the worktree and branch. It refuses if there are uncommitted files.

## Safety

- **Secrets:** reading or printing `.env*`, keys or credentials asks you first. Searches inside `node_modules`, `dist`, `.git` and similar folders are denied, which saves tokens.
- **Auth bypass for local smoke tests:** files are snapshotted before editing, and every edit is tagged `@sw-auth-bypass`. `restore` checks that no marker is left. A hook blocks `git commit`, `git push` and `gh pr create` while any marker exists.
- **Git:** Shipwright never merges, never force-pushes shared branches, and never merges `develop` into a feature branch. Conflicts with `develop` go through `integration/<branch>`.

## Statusline

```text
⛵ sw:verify 2/3 · large · feat/order-refund ⎇wt +3 ~2 · ↑2 · db:app_wt_order_refund
◆ Opus 5.5 · ctx ▓▓▓▓░░░░ 48% · $1.84 · 23m · api :41873
```

## Project layout

```text
.claude-plugin/   plugin + marketplace manifests
skills/           16 workflow skills + 3 stack packs (references load on demand)
agents/           8 sw-* agents
bin/              hooks, wt.cjs, auth-bypass, coverage gate, statusline, installer lib
tests/            node:test suites (worktree tests use real Postgres + Redis)
site/             GitHub Pages website
docs/specs/       design spec and build plan
```

## Contributing

`npm test` runs every suite. The worktree integration tests need local Postgres and Redis (`SW_TEST_PG`, `SW_TEST_REDIS`); CI runs them against Postgres 16 and Redis 7 service containers. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © jamesngdev
