# Plan: sw:threat-model skill
**Design:** docs/specs/<YYMMDD>-threat-model/design.md · **Size:** small · **Base:** main

## File map
- `tests/skills.test.cjs` — create: asserts every `skills/*/SKILL.md` has frontmatter name+description, description ≤220 chars, ≤120 lines, and every `references/...md` link resolves
- `skills/threat-model/SKILL.md` — create: trigger rules, procedure, output format
- `skills/threat-model/references/stride-lite.md` — create: STRIDE prompts per boundary type, applied to API/web/queue/upload
- `skills/threat-model/references/abuse-cases.md` — create: abuse-case catalogue by feature type (auth, payments, upload, webhook, multi-tenant, external fetch) with default mitigations + test ideas
- `skills/architect/SKILL.md` — modify: new step "3b. Threat model" (invoke when trigger matches), `## Threat model` section in design.md template
- `skills/plan/SKILL.md` — modify: each threat mitigation → test-first task
- `README.md`, `site/guide.html`, `docs/specs/design.md`, `CHANGELOG.md`, `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — modify: 16 skills, 0.2.0, docs

## Tasks
### T1: Skill lint test
- Files: `tests/skills.test.cjs` (create)
- Interface: `node --test` suite reading `skills/*/SKILL.md`; no dependencies
- TDD: test-first (add a test that the `threat-model` skill exists and satisfies limits → red until T2; general limit tests should pass on existing skills — if any existing skill violates, fix the limit in the test only if CONTRIBUTING says "about", else shorten the skill and note a Ruling)
- Tests: `it('every skill has name and description')`, `it('description is ≤220 chars')`, `it('SKILL.md is ≤120 lines')`, `it('relative reference links resolve')`, `it('threat-model skill is present')`
- Done when: `npm test -- tests/skills.test.cjs` → red only on threat-model presence
- [ ] write failing test · [ ] run (red) · [ ] commit with T2

### T2: threat-model skill
- Files: `skills/threat-model/SKILL.md`, `references/stride-lite.md`, `references/abuse-cases.md` (create)
- Interface: frontmatter `name: threat-model`, `description:` ≤220 chars phrased as when-to-use. Body: (1) Trigger, (2) Inputs (research.md, draft decisions), (3) Procedure: assets → trust boundaries/entry points → STRIDE-lite per boundary → rank (likelihood×impact, H/M/L) → mitigation + test per threat, (4) Output format `## Threat model` table `ID | STRIDE | abuse case | mitigation | test`, residual risks; small tasks top 3 threats; (5) Standalone mode writes `.sw/specs/<slug>/threat-model.md`; (6) reference table
- TDD: none (docs); covered by T1 test
- Tests: T1 suite green
- Done when: `npm test` passes
- [ ] write · [ ] run (green) · [ ] commit

### T3: Wire architect + plan
- Files: `skills/architect/SKILL.md`, `skills/plan/SKILL.md` (modify)
- Interface: architect step: "If task is large or touches authn/authz, payments, uploads, secrets, webhooks/external fetch, multi-tenant data → invoke `/sw:threat-model`; include its output as `## Threat model` in design.md." plan step: "Each threat's mitigation → a test-first task with the threat ID in the test name."
- TDD: none; T1 enforces size limits
- Done when: `npm test` passes; `grep -n threat-model skills/architect/SKILL.md skills/plan/SKILL.md` shows both
- [ ] edit · [ ] run · [ ] commit

### T4: Docs & version
- Files: listed in file map; README "15 workflow skills"→16 and flow mention; guide.html adds `/sw:threat-model` in architect section; design.md skills table row; CHANGELOG `0.2.0`; version bump in the three manifests
- TDD: none
- Done when: `npm test` passes; `grep -rn "0.1.0" package.json .claude-plugin` shows none; token table in README unchanged-or-updated (+~220 chars)
- [ ] edit · [ ] run · [ ] commit

## Verify
No lint/typecheck/build/dev server in this repo. Run: `npm test` (worktree tests need Postgres+Redis — run with env if available, otherwise note skipped), plugin load check `claude --plugin-dir . ` listing `sw:threat-model` if feasible, link check via T1. Smoke/Playwright: n/a.

## Rulings
- Ruling: add a guard fix (T5, `bin/lib/patterns.cjs`, `guard-bash.cjs`, `auth-bypass.cjs`, hooks test) — the auth-bypass guard denied every commit in this repo because its own files contain the marker; user chose "exempt the guard's own files" — cost if wrong: one small revertable commit. Review follow-up: exemption only in the kit repo (plugin.json name `sw`), scan anchored at repo root.
- Ruling: threat IDs use `TM` prefix — avoid clashing with plan task IDs `T1…` (review finding).
- Ruling: skip `/sw:init` and use a plain git branch/worktree — plugin repo has no env domains; `wt.cjs` DB/Redis provisioning is irrelevant — cost if wrong: none.
