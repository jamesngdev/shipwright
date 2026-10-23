---
name: pr
description: Opens the PRs for a finished branch — squash to 1–3 commits, PR to the base branch (kept open) plus PR to develop, via integration branch on conflict.
argument-hint: "[parent-branch]"
---

# PR

Running this stage authorizes committing pending work, pushing the feature branch, and opening PRs. Never merge, never force-push, never push to `master`/`main`/`develop` directly.

## 1. Preflight
- `BRANCH=$(git branch --show-current)`; refuse on `master|main|develop`. `gh auth status` must pass.
- Parent branch: the argument, else the main worktree's branch (`git -C "$(git rev-parse --git-common-dir)/.." branch --show-current`), else `origin/HEAD`. Parent = develop or empty → single PR to `develop`.
- `node ~/.claude/shipwright/bin/auth-bypass.cjs check` must print `clean`.
- Branch hygiene: `git merge-base HEAD origin/<parent>` is on the parent; `git log --oneline origin/<parent>..HEAD | grep -i "merge.*develop"` is empty. If not → rebase onto the parent (before the first push only).

## 2. SSH identity
If the user's instructions define per-owner identity switches (e.g. `aw` work / `ap` personal shell aliases), pick by the owner in `git remote get-url origin` and run it via `zsh -ic '<alias>'` before pushing. Unsure which owner → ask.

## 3. Squash (only if the branch has never been pushed)
`git ls-remote --exit-code --heads origin $BRANCH` fails → squash checkpoints into 1–3 meaningful commits (e.g. spec+migration, feature, tests/docs): `git reset --soft $(git merge-base origin/<parent> HEAD)` then commit in logical groups. Already pushed → keep history (no force-push).

## 4. Push and draft
`git push -u origin $BRANCH`. Body (same for both PRs) written to `.sw/pr-body.md`:
```markdown
## Summary
<what and why, grouped by area; link docs/specs/<YYMMDD>-<slug>/design.md>
## API changes
<METHOD /path — Added|Changed|Removed; request/response/error changes — or "None.">
## Verification
<verify step table: lint, typecheck, unit, integration, coverage, build, dev server, smoke, playwright>
<smoke table + re-runnable curl lines (no tokens)>
## Rulings & follow-ups
<rulings from plan.md worth a reviewer's attention; minor review items deferred>
```
Never fabricate results: a step not run is written as "not run — <reason>".

## 5. PR #1 → parent (kept open)
`gh pr create --base <parent> --head $BRANCH --title "<conventional title>" --body-file .sw/pr-body.md` (existing PR → reuse its URL).

## 6. PR #2 → develop
Conflict test without touching the feature branch:
```bash
git fetch origin develop -q
git merge-tree --write-tree --name-only origin/develop HEAD >/dev/null 2>&1 && CONFLICT=no || CONFLICT=yes
```
- No conflict → `gh pr create --base develop --head $BRANCH …`.
- Conflict → `git switch -c integration/$BRANCH origin/develop` (never put "develop" in the branch name), `git merge --no-ff $BRANCH`, resolve, commit, `git push -u origin integration/$BRANCH`, PR it to develop, `git switch $BRANCH`. Unresolvable → stop and list the conflicting files.
- **Never merge develop into the feature branch.**

## 7. Report
```
PR #1 → <parent>: <url>   (keep open)
PR #2 → develop:  <url>   [via integration/<branch>]
```
`node ~/.claude/shipwright/bin/state.cjs set stage=verify-dev` → `/sw:verify-dev`.
