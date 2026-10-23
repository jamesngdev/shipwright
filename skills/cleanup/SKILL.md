---
name: cleanup
description: Removes a finished task's worktree — drops its Postgres DB, flushes its Redis db, deletes the merged branch. Use after the base-branch PR merges or to abandon a task.
argument-hint: "<slug> [--force]"
---

# Cleanup

1. From the main checkout: `node ~/.claude/shipwright/bin/wt.cjs list` to find the worktree.
2. Check the branch is merged into its base (`gh pr view <branch> --json state` or `git branch --merged <base>`). Not merged → tell the user and ask before continuing (abandoning work is their call).
3. Stop anything running from the worktree (dev server on its `PORT`).
4. `node ~/.claude/shipwright/bin/wt.cjs remove <slug>`:
   - refuses when the worktree has uncommitted or untracked files — show them; only pass `--force` if the user confirms they are disposable;
   - drops `<db>_wt_<slug>`, flushes the Redis db index, removes the worktree, deletes the branch if merged (`--force` deletes unmerged).
5. Report what was removed. Remote branches (`integration/*`, the feature branch) are left to GitHub's "delete branch on merge" — mention any still present.
