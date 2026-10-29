---
name: threat-model
description: Use at design time for large tasks or any feature touching auth, payments, uploads, secrets, webhooks, external fetch or multi-tenant data — finds abuse cases and turns them into mitigations and tests.
---

# Threat model

A short, design-time pass: what can an attacker do to this feature, and which test proves we stopped them. Runs inside `/sw:architect` (before approaches are final) or standalone: `/sw:threat-model <feature>`.

## 1. Trigger
Run when ANY is true; otherwise skip and say "no threat model: <why>".
- size is large;
- touches authn/authz, sessions, roles, tenancy or ownership;
- handles money, credits, coupons or anything countable and valuable;
- accepts files, URLs, HTML/markdown, or other untrusted external input (webhooks, imports, user-supplied fetch targets);
- stores or moves secrets, tokens or PII;
- changes an exposed trust boundary (new public endpoint, queue consumer, admin tool).

## 2. Inputs
`research.md`, the draft decisions from the interview, and the code the change touches (route/guard layout, how tenancy is enforced). Never ask what the code settles.

## 3. Procedure
1. **Assets** — what is worth stealing, corrupting or abusing (data, money, accounts, availability). One line each.
2. **Entry points & trust boundaries** — who can reach it (anonymous, user, other tenant, admin, third-party, internal job) and where data crosses a boundary (client→API, API→DB, API→external, queue→worker).
3. **Threats** — walk each boundary with [stride-lite.md](references/stride-lite.md); pull feature-specific abuse cases from [abuse-cases.md](references/abuse-cases.md). Keep only threats that are reachable here.
4. **Rank** — likelihood and impact as H/M/L; `Sev` is the higher of the two; drop L×L.
5. **Mitigate & prove** — one concrete mitigation per threat (with the file/layer that enforces it) and one test that fails without it (`it('rejects …')`). A mitigation with no test is a residual risk.
6. **Ask only if blocked** — a mitigation that changes the product (e.g. email verification, approval step) goes to the user as one `AskUserQuestion`; everything else is decided and recorded.

## 4. Output
Append to `design.md` (or write `<main>/.sw/specs/<slug>/threat-model.md` when standalone), max ~25 lines:

```markdown
## Threat model
**Assets:** … · **Entry points:** … · **Boundaries:** …
| ID | STRIDE | Abuse case | Sev | Mitigation (where) | Test |
|---|---|---|---|---|---|
| TM1 | E | member of tenant A reads tenant B's order by id | H | `where: { id, orgId }` in OrderRepo | `it('TM1: 404s on other tenant order')` |
**Residual risks:** … (accepted / needs follow-up)
```
Small tasks: top 3 threats only. Threat IDs use the `TM` prefix (plan tasks are `T1…`) and are referenced by `/sw:plan` tasks.

## 5. Rules
- Be specific: a named actor, an action, an outcome. "Attacker could inject" is not a threat; "a free-tier user replays the refund call to be paid twice" is.
- Prefer mitigations that are structural (constraint, guard, query scope) over procedural (remember to check).
- Do not invent controls the stack lacks; if one is needed, it becomes a plan task.
- Never put real secrets, tokens or customer data in the document.

## References
| Load when | File |
|---|---|
| Walking boundaries, STRIDE prompts | [stride-lite.md](references/stride-lite.md) |
| Feature type is auth, payments, upload, webhook, multi-tenant, external fetch, admin, AI/LLM | [abuse-cases.md](references/abuse-cases.md) |
