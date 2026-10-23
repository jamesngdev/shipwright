---
name: plan
description: Planning stage — turns an approved design into bite-sized, test-first tasks with exact files, signatures and tests, red-teams large plans, and gets approval (Gate 2). Use after architect.
---

# Plan

Write for an engineer who has never seen this codebase: they write idiomatic code once they know the exact interface and the exact test. What they cannot know is what you decided — document that.

Output: `<main>/.sw/specs/<slug>/plan.md`.

## 1. File map first
List every file to create/modify and its single responsibility. Follow existing patterns; split by responsibility, not by layer. This locks decomposition.

## 2. Tasks
A task = the smallest unit with its own test cycle that a reviewer could reject independently. Fold setup/config/docs into the task that needs them.

```markdown
# Plan: <task>
**Design:** docs/specs/<YYMMDD>-<slug>/design.md · **Size:** small|large · **Base:** <branch>

## File map
- `path` — responsibility

## Tasks
### T1: <name>
- Files: `src/...` (modify), `src/....spec.ts` (create)
- Interface: `functionName(arg: Type): Promise<Result>` / `POST /v1/x {body} → 201 {shape} | 409 ERR_X`
- TDD: <test-first|integration|none> (see tiers)
- Tests: `it('rejects refund when order already refunded')`, … (names = behaviors)
- Done when: `<exact command>` passes
- [ ] write failing test · [ ] run (red) · [ ] implement · [ ] run (green) · [ ] commit

## Verify
lint · typecheck · unit · integration (coverage ≥ 80% changed files) · build · dev server · smoke: <endpoints + cases> · playwright: <flows, frontend only>

## Rulings
```

TDD tiers (state one per task):
- **test-first** — domain/service logic, every bug fix (repro test must fail first).
- **integration** — endpoints/handlers: request → real DB → response, success + error cases.
- **none** — config, DTO declarations, wiring, migrations (still covered by integration tests).

Include real values from the design (field names, error codes, limits). Code snippets only where an interface or tricky logic must be exact.

## 3. Red-team (large only)
Re-read the plan as three hostile reviewers, fix what they find, note it under Rulings:
- **Breaker** — races, partial failure, retries, null/empty/huge inputs, timezones, money rounding.
- **Operator** — migration on a big table, lock time, rollback, missing logs/metrics, config drift.
- **Skeptic** — YAGNI: what can be cut; tasks too big to review; hidden coupling between tasks.

## 4. Gate 2
Show: task list (one line each), verify plan, open risks. ⛔ Wait for approval. After approval execution is continuous — say so.
