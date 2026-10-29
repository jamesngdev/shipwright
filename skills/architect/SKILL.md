---
name: architect
description: Design stage — interviews the user one question at a time on the architecture decisions the task touches, compares approaches, writes design.md for approval.
---

# Architect

You build what you believe the user wants, and that belief is usually thinner than it feels. This stage makes the hundred small decisions explicit while they are cheap. Run it in the main thread.

## 1. Read before asking
Read `research.md` and the code it points to. Never ask what the code, the research or earlier conversation already answers.

## 2. Echo (one short message)
In ≤ 150 words: what you understood (what, for whom, why), how it works today, and anything found that changes the request (a constraint, a conflict, a cheaper path).

## 3. Interview — one question per AskUserQuestion call
Walk this checklist; ask ONLY items the task touches and the code does not settle. Soft cap ~10 questions (small tasks: 2–4). Each question: the concrete choice, a recommended option first ("(Recommended)"), and in each option's description what it changes in the build.

| Area | Typical question |
|---|---|
| Data model & migration | new table vs column; nullable + backfill plan; migration order vs deploy; index for the new query |
| API contract | new endpoint vs extend; versioning; backward compatibility for existing clients; pagination shape; error codes |
| Consistency | what must be atomic (transaction boundary); outbox/eventual for cross-service |
| Idempotency & retries | idempotency key? what happens on double submit / webhook redelivery |
| Concurrency | race on the same row/resource (lock, version column, atomic update, unique constraint) |
| Cache | what is cached, key, TTL, invalidation trigger, stampede protection |
| AuthZ & data exposure | who may call it; ownership checks; fields never returned |
| Failure modes | external call timeouts, partial failure, fallback, user-visible error |
| Performance | expected volume, N+1 risk, payload size, hot path |
| Observability | logs/metrics that prove it works in dev/prod |
| Rollout | feature flag, migration safety, rollback path |
| Frontend (if any) | states (loading/empty/error), optimistic update, accessibility, responsive targets |

## 3b. Threat model
If the `/sw:threat-model` trigger list matches (large task, auth, money, uploads, secrets/PII, external input, new boundary), run it after the interview and keep its output as `## Threat model` in design.md. Otherwise skip.

## 4. Approaches
Present 2–3 approaches in one message: each with how it works, trade-offs (complexity, performance, risk, effort) and your recommendation with the deciding reason. The user picks (or you proceed with the recommendation if they say so).

## 5. design.md → Gate 1
Write `<main>/.sw/specs/<slug>/design.md` (serves as the ADR):
```markdown
# Design: <task>
**Decision:** <one paragraph>
## Context            (problem, constraints from research)
## Decisions          (one line per answered question: choice — why)
## Contracts          (endpoints/DTOs/events/UI states with shapes and error codes)
## Data changes       (schema, migration, backfill, indexes)
## Rejected options   (option — why not)
## Risks & rollout    (risk → mitigation; flag/rollback)
## Threat model       (only when /sw:threat-model ran: threats TM1…, mitigations, tests, residual risks)
## Test strategy      (unit: domain rules; integration: endpoints + DB; e2e/Playwright: flows; what proves done)
```
Small tasks: Decision, Contracts, Test strategy only.

Show a ≤ 15-line summary and ask for approval. ⛔ Do not plan until approved; apply requested changes and re-ask.
