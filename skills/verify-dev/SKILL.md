---
name: verify-dev
description: Post-deploy check on dev — after the develop PR is merged and the user confirms the deploy, smoke-tests changed endpoints on the dev domain; reads logs on failure.
argument-hint: "[pr-number]"
---

# Verify on dev

The kit never merges. Dev domain, health path and dev auth come from `CLAUDE.local.md`; the logs MCP from `~/.claude/shipwright/config.json` → `logsMcp`.

## 1. Wait for the merge
PR = the develop PR from `/sw:pr` (or the argument). Check: `gh pr view <n> --json state,mergedAt,mergeCommit`.
- Not merged → tell the user it is waiting, and check again when they come back (or use `/loop 10m /sw:verify-dev <n>` if they want polling). Do not busy-wait.
- Closed without merge → stop and report.

## 2. Confirm deploy
After merge, ask once: "Merged at <time>. Is the deploy live on dev?" Optionally show the latest workflow run on develop (`gh run list --branch develop --limit 3`). Continue only after the user confirms.

## 3. Smoke on dev
- Health: `GET <dev><health>` → 200 (if it reports a version/commit, it must contain the merge commit).
- Auth: obtain a token as described in `CLAUDE.local.md` (no bypass on shared environments, ever). No dev auth configured → test public endpoints only and say so.
- Re-run the smoke table from verify against the dev domain: happy path + error cases, plus 401/403 now that real auth is on.
- Never write destructive data on dev beyond what the feature's own happy path creates; never touch prod.

## 4. On failure
1. Pull evidence: logs via the configured `logsMcp` around the failing request (time window, request id). `logsMcp` is null → report the failing calls and stop.
2. Classify:
   - **Feature-code bug** → `/sw:debug` → fix with a failing test first in the worktree → verify (local) → push to the feature branch (and the integration branch if one exists) → the existing PRs update → wait for merge + deploy again → re-verify. Max 2 rounds.
   - **Infra / config / data issue** (env var missing on dev, migration not run, service down) → report with evidence and the exact fix needed; do not change the environment.

## 5. Report
| Check | Result |
|---|---|
| health | 200, commit abc123 |
| `POST /v1/...` happy | 201 ✓ |

`node ~/.claude/shipwright/bin/state.cjs set stage=done`. Remind: `/sw:cleanup <slug>` once the PR to the base branch is merged.
