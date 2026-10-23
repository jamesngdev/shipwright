---
name: ship
description: Use for any feature or bug-fix implementation request. Runs the Shipwright flow end to end — triage, research, architect, plan, worktree, TDD build, verify, review, llms.txt, PR, verify on dev.
argument-hint: "<task> [--tiny|--small|--large] [--resume]"
---

# Ship

You orchestrate. Stages are separate skills (`/sw:<stage>`); invoke each one when you reach it and follow it exactly. `SW=~/.claude/shipwright/bin` (fallback: `${CLAUDE_PLUGIN_ROOT}/bin`).

## 0. Preflight
- No `CLAUDE.local.md` at the repo root → run `/sw:init` first (it is quick).
- `--resume` → `node $SW/state.cjs get` in the worktree, continue from `stage`.

## 1. Triage
Read just enough code to size the task (codegraph / Grep, not whole files), then pick:

| Size | When | Flow |
|---|---|---|
| tiny | ≤ ~20 lines, one file, no schema/API/contract change, intent obvious | branch in place → edit → verify(fast) → llms-txt → pr |
| small | one module, no new data model, ≤ ~5 tasks | discover(code) → architect(light) → plan → worktree → build(inline) → verify → review → llms-txt → pr → verify-dev |
| large | new model/migration, API contract change, cross-module, concurrency/cache/security impact, or > 5 tasks | all stages, research included, plan red-team, build via subagents |

User flags override. State the size and one-line reason, then continue (no confirmation needed).
Track progress: `node $SW/state.cjs set slug=<slug> size=<size> stage=<stage>` at the start of each stage (in the main checkout until the worktree exists, then in the worktree).

## 2. Stages

| # | Stage | Skill | Gate |
|---|---|---|---|
| 1 | discover | `/sw:discover` | — |
| 2 | architect | `/sw:architect` | ⛔ user approves design |
| 3 | plan | `/sw:plan` | ⛔ user approves plan |
| 4 | worktree | `/sw:worktree` | — |
| 5 | build | `/sw:build` | — |
| 6 | verify | `/sw:verify` | — |
| 7 | review | `/sw:review` | — |
| 8 | llms-txt | `/sw:llms-txt` | — |
| 9 | pr | `/sw:pr` | — |
| 10 | verify-dev | `/sw:verify-dev` | waits for merge + user's "deployed" |

Artifacts: draft into `<main>/.sw/specs/<slug>/` (git-excluded) during stages 1–3; `/sw:worktree` moves them to `<worktree>/docs/specs/<YYMMDD>-<slug>/` so they ship with the PR.

## 3. After Gate 2: run continuously
Do not check in between stages. No "should I continue?", no progress essays — one short line per stage.

Stop and ask ONLY for:
1. an irreversible or destructive operation (dropping non-worktree data, deleting branches with unmerged work, rewriting pushed history);
2. a security-sensitive action (secrets, permissions, auth changes beyond the plan);
3. a side effect outside the worktree that norms reserve for the user (merging, pushing to a shared branch, deploying, publishing);
4. a plan so broken that every path forward is a guess;
5. verify still failing after 3 fix rounds, or verify-dev after 2.

Everything else: decide, then append to `plan.md` → `## Rulings`: `Ruling: <decision> — <why> — <cost if wrong>`. Keep going.

## 4. Context discipline
- Subagents get exactly the context they need (file paths, the task text) — never your history.
- Ask subagents for short reports; read their files only when needed.
- Never paste large logs into the conversation; summarize the failing part.

## 5. Finish
After `/sw:pr`: report PR URLs, verify summary, rulings made. Then `/sw:verify-dev` polls for the merge. After it passes, remind the user that `/sw:cleanup <slug>` drops the worktree, DB and Redis db once the PR to the base branch is merged.
