# Shipwright — Design Spec

> Status: **DRAFT — awaiting approval** · Date: 2026-10-23
> Sources merged: `claudekit/.claude` (infra, worktree script, plan red-team, fix routing) + `obra/superpowers` (brainstorm → plan → SDD → TDD → verification discipline) + user's `create-pr`, `llms-txt-sync`, `using-prisma/redis/docker`, `perf-review`, `security-review`.

## 1. Goals

1. Best possible result per task through **deep architecture questioning + research before code**.
2. **Fast and token-cheap**: nothing injected per prompt, lazy references, model routing, small subagent reports.
3. **Isolation**: every non-tiny task runs in its own git worktree with its own DB / Redis / port.
4. **Proven correctness**: tiered TDD, coverage ≥ 80% on changed files, real dev-server API smoke tests, Playwright for frontend, verification on the dev environment after deploy.
5. Ask hard questions **early** (architect + plan gates), then run **non-stop to the PR**.

Non-goals: design/media/3D/e-commerce skills, document generation, kanban/journal tooling, Gemini CLI.

## 2. Packaging

- Claude Code **plugin** `shipwright`, installed at user scope. Commands prefixed `/sw:`.
- Skill files written in **English**; Claude replies in the user's language.
- `install.sh`:
  1. Back up `~/.claude/CLAUDE.md` → `~/.claude/backups/CLAUDE.md.<timestamp>`.
  2. Write/replace only the block between `<!-- shipwright:start -->` and `<!-- shipwright:end -->`; remove sections Shipwright supersedes (Post-Feature Auto-Chain, Branch & PR Base, Worktree workflow) after confirmation.
  3. Run `/sw:setup` (global config questions).
  - `uninstall.sh` restores the latest backup.
- Installs its own `sw-*` agents; **existing user agents in `~/.claude/agents/` are left untouched** (the `sw-` prefix avoids name clashes).
- Warns if superpowers or another workflow plugin is enabled, since they auto-trigger competing workflows (`agent-skills@addy-agent-skills` was uninstalled on 2026-10-23).
- Installs the Shipwright statusline (backs up the previous `statusLine` setting).

## 3. Configuration

| Scope | File | Content | Written by |
|---|---|---|---|
| Global | `~/.claude/shipwright/config.json` | local Postgres (`postgres@localhost:5432/postgres`, no password), local Redis (`localhost:6379`, no password), `logsMcp` (which MCP reads env logs), default base branch | `/sw:setup` (once) |
| Per repo | `CLAUDE.local.md` (auto-gitignored) | dev domain, prod domain, health path, dev auth (test account/token), stack notes | `/sw:init` (first run in repo, asks user) |
| Per repo | `.gitignore` | `.worktree/`, `CLAUDE.local.md` | `/sw:init` |

## 4. Workflow

```
/sw:ship "<task>"
 0 triage ───────── tiny  → do in place → verify(fast) → done
                    small → steps 1(code only),3,4,5,6..10 (no gates beyond plan)
                    large → all steps
 1 discover        scout code + docs + web, parallel, research.md
 2 architect   ⛔  deep interview → approaches → design.md (ADR)        [GATE 1: user approves]
 3 plan        ⛔  task plan (+ red-team on large) → plan.md            [GATE 2: user approves]
 ── from here: continuous, no check-ins ──
 4 worktree        .worktree/<slug>, cloned deps/env/DB/Redis/port
 5 build           tiered TDD; inline (small) or subagent-per-task (large)
 6 verify          lint → typecheck → unit → integration(+coverage) → build
                   → dev server → API smoke → Playwright (frontend)    [auto-fix ≤ 3 rounds]
 7 review          one Opus whole-branch review (+ security/perf/prisma/redis lenses)
 8 llms-txt        sync llms.txt for client-facing changes (mandatory step; may no-op)
 9 pr              squash to 1–3 commits → PR→base (+ PR/integration→develop)
10 verify-dev      poll PR; after merge + user confirms deploy → smoke on dev domain,
                   read logs via configured MCP                          [auto-fix ≤ 2 rounds]
11 cleanup         /sw:cleanup after merge: remove worktree, drop DB, clear Redis db
```

**Stop only for** (after Gate 2): irreversible/destructive operation · security-sensitive action · external side effect (merge, push to shared branch, publish, prod) · plan so broken every path is a guess · verify still failing after 3 rounds. Everything else is decided and logged as `Ruling: <decision> — <why> — <cost if wrong>` in `plan.md`.

### Triage rules
- **tiny**: ≤ ~20 lines, one file, no schema/API/contract change, obvious intent.
- **small**: one module, no new data model, ≤ ~5 plan tasks.
- **large**: new data model/migration, API contract change, cross-module, concurrency/caching/security implications, or > 5 tasks.
- User can force: `--tiny|--small|--large`.

## 5. Stages in detail

### 1. Discover (`sw:discover`)
- Sources: codegraph `codegraph_explore` (fallback Grep/Glob), context7 for library docs, WebSearch for practices/recent changes, `gh search code` for real-world implementations. No Gemini.
- Depth: small → code scout only. Large → 2–3 parallel `sw-researcher` agents (Haiku) with disjoint questions.
- Output `docs/specs/YYMMDD-<slug>/research.md`: current behavior, touched files, constraints, prior art, open risks. ≤ 1 page. No glossary/tutorial filler.

### 2. Architect (`sw:architect`) — main thread, Opus
- Reads research first; never asks what the code already answers.
- Interviews **one question at a time** via AskUserQuestion, each with a recommended option and what it changes. Only checklist items the task touches; soft cap ~10:
  data model & migration/backfill · API contract & backward compatibility · transactions/consistency · idempotency & retries · concurrency/races · cache & invalidation · authn/authz & data exposure · failure modes & timeouts · performance (N+1, indexes, pagination, payload size) · observability (logs/metrics) · rollout (flag, rollback, migration order).
- Presents 2–3 approaches with trade-offs; user picks.
- Writes `design.md`: problem, decision, rejected alternatives, contracts, data changes, risks, test strategy. **Gate 1.**

### 3. Plan (`sw:plan`)
- superpowers-style: exact files, signatures, test names per task; each task independently testable.
- Large: `sw:plan red-team` pass (claudekit personas, trimmed) before showing the user.
- `plan.md` holds tasks as checkboxes + Rulings ledger. **Gate 2.**

### 4. Worktree (`sw:worktree`, extends claudekit `worktree.cjs`)
- Location `<repo>/.worktree/<type>-<slug>`; auto-add `.worktree/` to `.gitignore`. Branch from the root worktree's branch, else `master`; never `develop`. Tiny tasks: no worktree.
- **Deps**: APFS clone `cp -cR node_modules` (instant, copy-on-write, isolated — protects main checkout's Prisma client). Non-APFS fallback: symlink if lockfile and `schema.prisma` unchanged, else real install. Go: shared module cache, nothing to do.
- **Env**: copy only `.env`, `.env.local`, `.env.development*` from the main checkout; never `.env.production*`. Rewrite `DATABASE_URL` → worktree DB, `PORT` → random free port, Redis → dedicated db index / key prefix.
- **DB**: new DB `<db>_wt_<slug>` on local Postgres. Source > 100MB → schema (migrations) + seed only; else `pg_dump | pg_restore`.
- **Remove** (`sw:cleanup`, after merge): drop DB, flush Redis db, remove worktree + branch.

### 5. Build (`sw:build`)
- **Tiered TDD**: service/domain logic and every bug fix → failing test first (bug: reproduce red first). Endpoints → integration/e2e. Config/DTO/wiring → no TDD required.
- Tests touching DB → real Postgres (worktree DB). Unit tests → mock repositories.
- small → inline. large → one `sw-implementer` (Sonnet) per task + `sw-spec-checker` (Sonnet, spec compliance only) after each.
- Commit per task as checkpoints.

### 6. Verify (`sw:verify`) — runs in `sw-verifier` (Sonnet) to keep logs out of main context
Order: lint/format → typecheck → unit → integration (coverage ≥ 80% on changed files) → build → start dev server (random port) → API smoke → Playwright headless (frontend only).
- **API smoke**: hit every changed endpoint with success + error cases (400/401/403/404/409); report as table + re-runnable curl lines.
- **Auth for smoke** (local only): read the auth code, temporarily bypass/mock it. Three guards:
  1. every bypass edit tagged `// @sw-auth-bypass`;
  2. patch saved before, restored after, `git diff` verified marker-free;
  3. PreToolUse hook blocks `git commit` / `git push` while any marker exists in the repo.
- **Playwright**: headless script collects console errors, failed requests, screenshots; screenshots are only read on failure or when UI comparison is needed.
- Failure → fix → re-run from the failing step; ≤ 3 rounds, then stop and report.

### 7. Review (`sw:review`)
- One `sw-reviewer` (Opus) over the whole branch diff vs base: correctness, plan/design adherence, plus lenses loaded only when relevant: security, performance, Prisma, Redis, Docker, API design.
- Critical/Important fixed before PR (then re-verify affected steps).

### 8. llms.txt (`sw:llms-txt`, generalized from `llms-txt-sync`)
- Mandatory step of every feature. Updates `llms.txt` + `docs/llm/*.md` (llmstxt.org) for client-facing changes: behavior, relations to other APIs, request/response, error codes.
- Repo without `llms.txt` → offers to create once; internal/admin-only change → explicit no-op with reason.

### 9. PR (`sw:pr`, from user's `create-pr`)
- Switch SSH identity (personal `ap` / Apero `aw`) by remote owner.
- Squash to 1–3 commits; verify branch only contains its own commits on base.
- PR #1 → base (kept open). PR #2 → `develop`; on conflict create `integration/<branch>` from develop and merge feature into it. Never merge develop into the feature branch. Never merge, never force-push to shared branches.
- Description: summary, API changes, verify table, smoke curl lines, links to design/plan.

### 10. Verify dev (`sw:verify-dev`)
- Poll PR #2 / integration PR via `gh pr view --json state,mergedAt`. Kit never merges.
- After merge, ask user to confirm the deploy is live on dev; then smoke the changed endpoints against the dev domain using dev auth from `CLAUDE.local.md`; check health endpoint.
- On failure, read logs via the configured `logsMcp`. Feature-code bug → fix, push, re-verify (≤ 2 rounds). Infra issue → report.

## 6. Components

**Skills (≈17, short descriptions, references lazy-loaded)**
| Skill | Origin |
|---|---|
| `using-shipwright` (bootstrap, routing table) | superpowers using-superpowers (rewritten, no "1% rule") |
| `sw:ship` (orchestrator) | new (replaces claudekit cook) |
| `sw:setup`, `sw:init` | new |
| `sw:discover` | claudekit scout + research (rewritten) |
| `sw:architect` | superpowers brainstorming + claudekit plan/validate |
| `sw:plan` | superpowers writing-plans + claudekit red-team |
| `sw:worktree`, `sw:cleanup` | claudekit worktree.cjs (extended) + superpowers using-git-worktrees |
| `sw:build` | superpowers SDD/executing-plans + TDD |
| `sw:debug` | superpowers systematic-debugging + claudekit fix routing |
| `sw:verify` | new + superpowers verification-before-completion |
| `sw:review` | superpowers requesting/receiving-code-review + user's perf/security-review |
| `sw:llms-txt` | user's llms-txt-sync (generalized) |
| `sw:pr` | user's create-pr |
| `sw:verify-dev` | new |

**Domain packs** (narrow descriptions, loaded only when the stack matches)
- `sw:node-backend`: NestJS, Prisma/Postgres (from using-prisma), Redis (using-redis), Docker (using-docker), API design.
- `sw:go`: Go project layout, testing, sqlc/pgx, errors, concurrency.
- `sw:frontend`: React/Next best practices (claudekit react-best-practices, frontend-development, web-design-guidelines), Playwright testing.

**Agents** (model pinned in frontmatter)
| Agent | Model | Role |
|---|---|---|
| `sw-scout` | Haiku | code discovery, ≤ 300-word report |
| `sw-researcher` | Haiku | docs/web/gh research, ≤ 400-word report |
| `sw-implementer` | Sonnet | one plan task, TDD |
| `sw-spec-checker` | Sonnet | task ↔ spec compliance |
| `sw-verifier` | Sonnet | verify pipeline, compact table report |
| `sw-debugger` | Sonnet | root-cause investigation for failing verify / dev smoke |
| `sw-docs-writer` | Sonnet | llms.txt + PR description drafting |
| `sw-reviewer` | Opus | whole-branch review |

Architect interview and gates run in the main thread.

**Hooks**
| Event | Hook | Origin |
|---|---|---|
| SessionStart | inject ≤ 1KB bootstrap (routing table + pointer) | superpowers (trimmed) |
| PreToolUse Bash/Read/Grep/Glob | `scout-block` (node_modules, dist, build…) | claudekit |
| PreToolUse Read/Bash | `privacy-block` (.env*, keys) | claudekit |
| PreToolUse Bash | `auth-bypass-guard` (blocks commit/push with marker) | new |

No UserPromptSubmit / PostToolUse hooks (claudekit's per-prompt ~3KB injection removed).

## 7. Token budget

| Item | claudekit today | Shipwright target |
|---|---|---|
| Per-prompt injection | ~3KB | 0 |
| Session start injection | ~3KB + rules files | ≤ 1KB |
| Always-loaded skill descriptions | ~12.5K chars (70 skills) | ≤ 3K chars (~20 skills) |
| Always-loaded agent descriptions | ~15K chars (16 agents) | ≤ 1.5K chars (6 agents) |
| Mandatory subagents per task | 5–6 (tester, reviewer, pm, docs, git…) | small: 1 verifier + 1 reviewer; tiny: 0 |
| Subagent report size | unbounded | capped 300–400 words |

## 8. Artifacts per feature
`docs/specs/YYMMDD-<slug>/{research.md, design.md, plan.md}` — committed with the PR.

## 9. Statusline (rebuilt)
Node script, < 50ms, git info cached 5s. Two lines, degrades to one on narrow terminals:
```
⛵ sw:verify 2/3 · large · feat/order-refund ⎇wt +3 ~2 · ↑2 · db:app_wt_order-refund
◆ Opus 5.5 · ctx ▓▓▓▓░░░░ 48% · $1.84 · 23m · api :41873
```
- Stage + round from `.worktree/<slug>/.sw-state.json` (written by each stage); hidden when no task is active.
- Worktree marker, dirty counts, commits ahead of base, worktree DB name, dev-server port when running.
- Context bar colored green < 60% / yellow < 80% / red ≥ 80%; session cost + duration from statusline JSON.

## 10. Decisions
- No `MISTAKE.md` integration in the kit.
- Existing agents untouched; kit ships its own 8 `sw-*` agents.
