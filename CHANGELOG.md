# Changelog

## 0.2.0 — 2026-10-29
- `sw:threat-model` skill: design-time STRIDE-lite threat model with abuse-case catalogue; `/sw:architect` runs it for large or security-sensitive tasks, `/sw:plan` turns mitigations into test-first tasks.
- Guard fix: the auth-bypass marker scan now runs from the repo root (it used to depend on the hook's cwd) and, inside the kit repo only, ignores the kit's own guard, script, test and guide files.
- `tests/skills.test.cjs` enforces skill description/length limits and reference links.

## 0.1.0 — 2026-10-23
First release.
- `/sw:ship` flow: triage → discover → architect (gate) → plan (gate) → worktree → build → verify → review → llms-txt → pr → verify-dev → cleanup.
- `wt.cjs`: worktrees with APFS-cloned `node_modules`, env subset, per-worktree Postgres DB (full or schema-only clone) and Redis db, free port.
- Guards: secret-read confirmation, heavy-dir search block, auth-bypass commit/push block.
- Changed-files coverage gate (lcov + Go), two-line statusline, installer with reversible CLAUDE.md block.
- Stack packs: node-backend, go, frontend; review lenses: security, performance.
- 8 `sw-*` agents with pinned models.
