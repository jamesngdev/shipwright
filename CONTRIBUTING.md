# Contributing

1. `npm test` — all suites. Worktree tests need Postgres + Redis:
   `SW_TEST_PG=postgresql://postgres:postgres@localhost:5432 SW_TEST_REDIS=redis://localhost:6379 npm test`
2. Try the plugin locally without installing: `claude --plugin-dir .`
3. Keep the kit lean — it is a feature:
   - skill `description` ≤ ~220 chars, phrased as *when to use*; SKILL.md ≤ ~120 lines; details in `references/` loaded on demand;
   - no `UserPromptSubmit`/`PostToolUse` hooks; hooks must never crash a session (`safe()` wrapper);
   - scripts are dependency-free Node (CommonJS) so they run from `~/.claude/shipwright/bin` anywhere.
4. Behavior changes update `README.md`, `site/` and `docs/specs/design.md`.
