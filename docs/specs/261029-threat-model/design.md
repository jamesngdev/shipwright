# Design: sw:threat-model skill

**Decision:** Add one skill, `skills/threat-model/SKILL.md` (≤120 lines, description ≤220 chars) plus `references/stride-lite.md` and `references/abuse-cases.md` loaded on demand. `/sw:architect` invokes it automatically for large tasks or any task touching auth, payments, uploads, secrets, or untrusted external input. Output is a `## Threat model` section in `design.md`; `/sw:plan` turns each mitigation into a test-first task. The skill is also user-invocable standalone.

## Contracts
- Trigger (architect): size=large OR task touches authn/authz, payments, file upload, secrets, webhooks/external fetch, multi-tenant data.
- Skill output (appended to design.md): assets, trust boundaries, entry points, table of threats `ID | STRIDE | abuse case | mitigation | test`, residual risks. Max ~25 lines; small tasks: top 3 threats only.
- Plan hook: each mitigation → a task with a failing security test first (tiered TDD "test first" bucket).
- Edits: `architect/SKILL.md` (+≈3 lines, step between Interview and Approaches), `plan/SKILL.md` (+≈2 lines), `review/references/security.md` untouched.
- Docs: README (skill count 15→16, flow note), `site/` mentions, `docs/specs/design.md`, `CHANGELOG.md` (0.2.0 entry), `plugin.json` version bump + `security` keyword.

## Rejected options
- secure-code pack, security-scan, security-audit: not selected now; can follow later.
- Review-stage mitigation check: not selected; keep review lens unchanged.

## Risks & rollout
- Always-loaded description cost grows ~220 chars → keep description short; README token table updated.
- Over-triggering slows small tasks → trigger criteria explicit; small tasks cap at 3 threats.

## Test strategy
- `npm test` stays green (existing suites cover hooks/install/wt; no code changes).
- Add a lint-style test asserting every `skills/*/SKILL.md` has description ≤220 chars and ≤120 lines (covers the new skill and enforces CONTRIBUTING).
- Manual: `claude --plugin-dir .` lists `sw:threat-model`; links in SKILL.md resolve to existing reference files.
