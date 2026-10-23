---
name: debug
description: Systematic root-cause debugging for bugs, failing tests, CI failures, log errors and performance regressions. Use before proposing any fix.
argument-hint: "<symptom | failing command | log excerpt>"
---

# Debug

**No fix without a root cause.** Guess-and-patch creates new bugs and wastes rounds.

## 1. Reproduce
Get a deterministic repro: the failing command, request, or test. Capture the exact error (first error, not the cascade). Can't reproduce → gather more evidence (logs, inputs, recent changes: `git log -p --since=…` on the touched area), do not guess.

## 2. Locate
- Trace backward from the symptom to where the bad value/state is first created — fix there, not where it surfaces.
- Compare with a working path (similar endpoint, previous commit: `git bisect run <test>` for regressions).
- Flaky test → run it alone and in the suite; suspect shared state, ordering, time, real timers, unawaited promises. Use condition-based waiting, never sleeps.
- Multi-layer system → log at each boundary once, run once, read where the data goes wrong.

## 3. Hypothesis → test
One hypothesis at a time, stated in one sentence ("X is null because Y runs before Z"). Verify it with the smallest experiment. Wrong → discard it fully before the next one. Three failed hypotheses on the same bug → step back: the model of the system is wrong; re-read the code path end to end (or dispatch `sw-debugger` with the evidence so far for a fresh look).

## 4. Fix
1. Write a test that reproduces the bug and fails (required).
2. Fix the root cause minimally.
3. Test green + the rest of the suite green.
4. Add a guard at the layer that should have caught it (validation, constraint, type) when cheap.

## 5. Report
`Root cause: … (file:line) · Fix: … · Proof: <test name> red → green · Guard: …`

## Specific failure types
- **Type errors**: fix the types at the source; no `any`/`as` casts or `@ts-ignore` to silence.
- **CI only**: diff the CI environment (node/go version, env vars, service containers, timezone, parallelism) — `gh run view <id> --log-failed`.
- **Logs (dev/staging)**: read through the logs MCP configured in `~/.claude/shipwright/config.json` (`logsMcp`); correlate by request id/time; never run commands that change the environment.
- **Performance**: measure first (EXPLAIN ANALYZE, query count per request, profiler) — no optimization without a number before and after.
