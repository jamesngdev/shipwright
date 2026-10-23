# Changelog

## 0.1.0 — 2026-10-23
First release.
- `/sw:ship` flow: triage → discover → architect (gate) → plan (gate) → worktree → build → verify → review → llms-txt → pr → verify-dev → cleanup.
- `wt.cjs`: worktrees with APFS-cloned `node_modules`, env subset, per-worktree Postgres DB (full or schema-only clone) and Redis db, free port.
- Guards: secret-read confirmation, heavy-dir search block, auth-bypass commit/push block.
- Changed-files coverage gate (lcov + Go), two-line statusline, installer with reversible CLAUDE.md block.
- Stack packs: node-backend, go, frontend; review lenses: security, performance.
- 8 `sw-*` agents with pinned models.
