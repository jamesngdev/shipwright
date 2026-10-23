---
name: review
description: Whole-branch review by sw-reviewer (Opus) against design and plan with security/performance lenses; fixes Critical/Important findings. Also how to receive review feedback.
---

# Review

## Request (once per branch, after verify passes)
Dispatch `sw-reviewer` with:
- worktree path, `BASE_SHA=$(git merge-base <base> HEAD)`, `HEAD_SHA=$(git rev-parse HEAD)`
- paths to `design.md` and `plan.md`
- which lenses apply (pass the reference paths only for those):
  - `${CLAUDE_PLUGIN_ROOT}/skills/review/references/security.md` — any endpoint, auth, input handling, file/URL/SQL handling, secrets
  - `${CLAUDE_PLUGIN_ROOT}/skills/review/references/performance.md` — DB queries, loops over I/O, caching, list endpoints, hot paths, frontend rendering
  - stack packs: `/sw:node-backend`, `/sw:go`, `/sw:frontend` references for the touched areas

It returns findings as `Critical | Important | Minor` with file:line, why, and a suggested fix.

## Act on findings
- **Critical / Important** → fix now (TDD for behavior changes), re-run the affected verify steps.
- **Minor** → fix if trivial, otherwise list in the PR description under "Follow-ups".
- Re-review only the fixed areas, max 2 cycles; then decide and record a Ruling.

## Receiving feedback (from the reviewer, PR comments, or the user)
1. Read it fully; restate the technical requirement in your own words if unclear — ask instead of guessing.
2. Verify against the code before changing anything; reviewers can be wrong about context.
3. YAGNI check: is the suggested "proper" feature actually used? (`grep` for callers.)
4. Push back with evidence when it is wrong for this codebase; otherwise just fix it.
5. No performative agreement ("Great point!"). State what you changed, or why not.
