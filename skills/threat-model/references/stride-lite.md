# STRIDE-lite prompts

Ask each question at every trust boundary you listed. Write a threat only when the answer is "yes, here".

| Letter | Threat | Ask | Typical structural mitigation |
|---|---|---|---|
| **S** | Spoofing | Can a caller pretend to be another user, service or webhook sender? | Verified session/JWT (alg pinned, expiry), signature check on webhooks, mTLS/service tokens between services |
| **T** | Tampering | Can data be changed in transit, in storage, or by a field the client should not control? | Server-side validation + whitelist DTOs (no mass assignment), signed/immutable records, DB constraints and checks |
| **R** | Repudiation | Could someone deny an action, or could we be unable to prove who did what? | Audit log with actor id, tenant, action, target; append-only; request id propagated |
| **I** | Information disclosure | Can a caller read what they should not (other tenant, other user, hidden fields, errors, logs)? | Ownership/tenant scope in the query, response DTOs with explicit fields, generic errors, no PII/tokens in logs |
| **D** | Denial of service | Can one caller exhaust CPU, memory, DB, queue, money (paid API calls) or lock others out? | Rate limits per user/IP/tenant, body/upload/page-size caps, timeouts, bounded queues, per-user quotas, lockout without enabling account DoS |
| **E** | Elevation of privilege | Can a caller reach an action or data above their role, or skip a step in a flow? | Deny-by-default guards, role checked server-side on every route, state machine enforced in service, no client-supplied role/owner |

## Boundary checklist
- **Client → API:** every field is attacker-controlled (including headers, ids, filenames, content-type). Is auth required? Which role? Is the object id checked against the caller?
- **API → DB:** parameterized queries only; tenant/owner predicate present; migrations do not widen access.
- **API → external service:** is the target URL fixed or attacker-influenced (SSRF)? Are secrets scoped and rotated? What if the response is malicious or huge?
- **External → API (webhook/callback):** signature verified before parsing, timestamp/replay window, event-id dedupe, idempotent handler.
- **Queue → worker:** message trusted? Re-check authorization in the worker; poison message does not loop forever; payload has no secrets.
- **Admin/internal tools:** separate auth, audit trail, no shared credentials with the public API.

## Ranking
Likelihood: **H** reachable by anonymous/any user with trivial effort · **M** needs an account or a specific condition · **L** needs insider access or chained bugs.
Impact: **H** cross-tenant data, money, account takeover, full outage · **M** single-user data, partial outage · **L** cosmetic or self-only.
Drop L×L. Everything H×anything is a blocker for the design.
