---
name: llms-txt
description: Keeps llms.txt and its topic files (llmstxt.org) in sync with client-facing API and business-rule changes — mandatory step of every feature before the PR; also audits drift on request.
argument-hint: "[audit]"
---

# llms.txt sync

Audience: client developers and AI assistants integrating with this service. They need **how each API behaves**, how it relates to other APIs, what to send/receive, and every error — never a shallow field dump, never internals (source paths, service names, tables).

Scripts: `S=${CLAUDE_PLUGIN_ROOT}/skills/llms-txt/scripts` (run with `python3 -I`). Spec + conventions: `references/llmstxt-spec.md`. Topic dir defaults to `docs/llm/` (override in `CLAUDE.local.md`).

## Flow mode (default, inside /sw:ship — applies edits, no approval stop)
1. **What changed for clients?** From `git diff <base>...HEAD` and design.md: endpoints added/changed/removed, request/response fields, enums, error codes, business rules (limits, states, side effects), config keys clients read.
   Nothing client-facing (internal refactor, admin-only, infra) → record `llms-txt: no client-facing change — <reason>` for the PR and stop.
2. **No `llms.txt` in the repo** → create it: H1 + one-line `>` summary + `## API` link list, and one topic file per module touched (minimal, only what this feature covers). Note it in the PR.
3. **Update** the topic file(s) for each change. Per endpoint:
   - `METHOD /v<n>/path` — purpose in one sentence, auth required, idempotency.
   - Request: params/body fields (type, required, constraints, defaults). Response: shape + example.
   - Errors: status + error code + when it happens + what the client should do.
   - Relations: what to call before/after, state transitions, side effects (emails, webhooks, balance changes).
   Remove documentation for removed endpoints; fix versions/paths that drifted.
4. **Validate**: NestJS repos: `python3 -I $S/discover_endpoints.py --root . [--default-version <n|none>]` and check every changed endpoint appears in the docs with the right version/path. Then `python3 -I $S/validate_llmstxt.py --root . [--docs <dir>]` → must print `OK`.
5. Commit with the feature (`docs(llms): …`). Report the files touched for the PR body.

## Audit mode (`/sw:llms-txt audit`)
Report drift without editing, ordered by severity:
1. MISSING client-facing (in code, not in docs) · 2. WRONG (doc contradicts code — version/path/field/enum) · 3. MISSING admin · 4. DEAD (documented, no longer in code) · 5. LINK/ANCHOR broken · 6. ORPHAN topic file · 7. spec violations.
Each item: code `file:line`, doc `file:line`, and a ```diff patch. Then ask which patches to apply.

## Common drift to check
- Version prefix: per-method `@Version`/router groups override the default → docs often show the wrong `/v1`.
- Enums/error codes: diff the code's list against the docs' list (`grep -oE` both, `diff <(...) <(...)`); request enums may differ from response enums — document both.
- Two controllers/routers in one file with different prefixes.
- Renamed headings break `#anchor` links — fix the referring docs.
