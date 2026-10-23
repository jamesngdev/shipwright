---
name: verify
description: Local verification gate — lint, typecheck, unit, integration, ≥80% coverage on changed files, build, dev server, API smoke, Playwright. Use after build or before claiming anything works.
---

# Verify

**Evidence before claims.** "Should pass" is not a result: run it, read the output, then report.
Run in the worktree. Commands come from `CLAUDE.local.md` → Commands. `SW=~/.claude/shipwright/bin`.
Large tasks: dispatch `sw-verifier` with the worktree path, commands, base branch and the plan's Verify section; it returns the table below. Small/tiny: run inline.

## Pipeline (stop at the first failing step, fix, re-run from that step)
| # | Step | Pass condition |
|---|---|---|
| 1 | lint / format | 0 errors (auto-fix flags allowed: `--fix`, `gofmt -w`) |
| 2 | typecheck | `tsc --noEmit` / `go vet ./...` exit 0 |
| 3 | unit | 0 failures, no skipped tests added by this branch |
| 4 | integration / e2e | 0 failures, run against the worktree DB |
| 5 | coverage | `node $SW/coverage-changed.cjs --base <base> [--lcov coverage/lcov.info \| --go cover.out]` → every changed source file ≥ 80% |
| 6 | build | exit 0 |
| 7 | dev server | boots on the worktree `PORT`, health endpoint 200 |
| 8 | API smoke | every changed endpoint: success + each error case pass |
| 9 | Playwright | frontend only: changed flows pass, 0 console errors, 0 failed requests |

Tiny tasks: steps 1–3 for the touched area + 8 if an endpoint changed.

## Fix rounds
Failure → `/sw:debug` style root cause → fix → re-run from the failed step. `node $SW/state.cjs set stage=verify round=<n>`. After 3 rounds still failing → STOP and report (failing step, root-cause hypothesis, what was tried). Never weaken a test, skip it, or lower thresholds to pass.

## 7. Dev server
```bash
cd <wt> && (<dev command> > .sw/dev.log 2>&1 &) ; for i in $(seq 60); do curl -sf localhost:$PORT<health> && break; sleep 1; done
```
Read `.sw/dev.log` only on failure (tail the first error). Stop the server at the end (`lsof -ti tcp:$PORT | xargs kill`).

## 8. API smoke with temporary auth bypass
1. Find how auth is enforced (guard, middleware, decorator) for the changed endpoints.
2. Snapshot BEFORE editing: `node $SW/auth-bypass.cjs start <files you will edit>`.
3. Bypass minimally (guard returns true / injects a fixed test user that owns the seeded data). Tag every edited line with a `// @sw-auth-bypass` comment. Restart the server.
4. Call each changed endpoint: happy path + 400 (validation) + 404/409 and business errors from the design. Authz cases (401/403) cannot be tested while bypassed — cover them in integration tests instead.
5. **Always** restore, even when a call failed: `node $SW/auth-bypass.cjs restore` (it fails if any marker is left). A hook blocks `git commit`/`git push` while markers exist.

Record each call:
| Endpoint | Case | Expected | Actual | ✓ |
|---|---|---|---|---|
| `POST /v1/orders/:id/refund` | happy | 201 `{status:"refunded"}` | 201 | ✓ |

Keep a re-runnable `curl` line per row (without tokens) for the PR.

## 9. Playwright (frontend)
Follow `/sw:frontend` → `references/playwright-verify.md`: headless run over the changed flows collecting console errors, failed requests and screenshots. Look at screenshots only on failure or when visual comparison is needed.

## Output
The step table with ✓/✗ and one-line evidence each (e.g. `unit 142/142`, `coverage 6/6 files ≥ 80%`), the smoke table, then `node $SW/state.cjs set stage=review`.
