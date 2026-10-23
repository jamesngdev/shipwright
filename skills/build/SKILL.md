---
name: build
description: Build stage — executes the approved plan with tiered TDD, inline for small tasks or one sw-implementer per task plus spec check for large ones.
---

# Build

Run continuously until all tasks are done. Record decisions as Rulings in `plan.md`.

## Tiered TDD (the Iron Law for test-first tasks: no production code without a failing test first)
- **test-first** (domain/service logic, every bug fix): write the test → run it, see it fail for the expected reason → minimal code → green → refactor. Wrote code first? Delete it and start from the test.
- **integration** (endpoints/handlers): test the real request → real DB (worktree DB) → response, success + each documented error.
- **none** (config, DTOs, wiring, migrations): no test-first, but integration tests must cover them.
- Unit tests mock repositories/external clients; integration tests never mock the DB.
- A test that passes on first run proves nothing — make it fail first (or temporarily break the code) to show it can.

## Small → inline
Work through tasks in order in this context. While iterating run only the focused test; run the full suite once per task before committing.

## Large → subagents
For each task, sequentially (tasks share files — never run implementers in parallel):
1. Write the brief to `<wt>/.sw/tasks/T<n>.md`: task text from the plan, relevant design excerpts (contracts, error codes), file paths, patterns to follow, test commands.
2. Dispatch `sw-implementer` with: worktree path, brief path, report path `<wt>/.sw/tasks/T<n>.report.md`. It returns ≤ 15 lines: status, commits, test summary, concerns.
3. Dispatch `sw-spec-checker` with: brief path, base SHA before the task, head SHA. It returns PASS or a list of gaps (missing requirement, extra scope, untested behavior).
4. Gaps → resume the implementer with the list (max 2 fix rounds) → re-check. Still failing → fix it yourself.
5. Status `BLOCKED`/`NEEDS_CONTEXT` → supply context or split the task; never let it guess.
Do not trust reports blindly: `git log --oneline -3` and `git diff --stat` after each task.

## Commits
Checkpoint commit per task, conventional style (`feat(orders): add refund endpoint`). They are squashed to 1–3 commits before the PR.

## Done when
Every task is checked off, the full test suite is green, and `node $SW/state.cjs set stage=verify` → `/sw:verify`.
