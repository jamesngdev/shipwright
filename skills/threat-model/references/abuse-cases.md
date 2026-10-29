# Abuse cases by feature type

Starting points, not a checklist: keep what applies, add what is specific. Each line: abuse case → default mitigation → test idea.

## Authentication & sessions
- Credential stuffing / brute force login or OTP → per-account and per-IP throttle, uniform error → `it('locks out after N failed OTPs')`
- Account enumeration via signup/reset/login messages → same response and timing for existing and unknown emails → `it('returns the same body for unknown email')`
- Password-reset token reuse or guessable token → single-use, ≥128-bit random, short expiry, invalidated on password change → `it('rejects a used reset token')`
- Stolen refresh token → rotation with reuse detection, revoke family → `it('revokes the family on refresh reuse')`
- Session fixation / long-lived tokens in URLs or localStorage → new session on login, httpOnly+Secure+SameSite cookie

## Authorization & multi-tenancy
- IDOR: change an id in the path/body to reach another user's or tenant's object → scope every query by owner/tenant → `it('404s on a resource of another tenant')`
- Mass assignment (`role`, `isAdmin`, `ownerId`, `price`) → whitelist DTO, strip unknown → `it('ignores role in the body')`
- Horizontal list leak (list/search/export without tenant filter) → tenant predicate in repo layer, not controller
- Privilege step skipping (call step 3 without step 2, approve own request) → state machine in service; approver ≠ requester
- Soft-deleted or suspended users still authorized → check status in the guard

## Payments, credits, coupons
- Double submit / webhook redelivery pays or refunds twice → idempotency key + unique constraint → `it('is idempotent on a replayed request')`
- Race on balance/stock (two parallel requests) → atomic conditional update or row lock, never read-then-write → `it('does not overspend under concurrent requests')`
- Client-supplied price/amount/currency → compute on the server from stored data
- Coupon/credit farming, negative or huge quantities → bounds validation, per-user limits
- Refund exceeding the paid amount, or after chargeback → service-level invariant: refunded ≤ captured

## File upload & import
- Executable/oversized/zip-bomb upload → size and count caps, type by content sniffing, extension allowlist, store outside web root with random names
- Path traversal in filename (`../../`) → ignore client name, generate key; `resolve` + base-dir check
- Stored XSS via SVG/HTML upload or filename → serve from a separate origin with `Content-Disposition: attachment` and `nosniff`
- CSV/Excel formula injection on export → prefix `= + - @` cells
- Malware → async scan before the file is available to others

## Webhooks & callbacks
- Forged sender → HMAC signature over the raw body, constant-time compare → `it('rejects an invalid signature')`
- Replay → timestamp window + event-id dedupe → `it('ignores a duplicate event id')`
- Slow or huge payload → body cap, respond 2xx fast, process async

## External fetch / URLs (SSRF)
- Server fetches an attacker URL (previews, imports, webhooks you send) → scheme allowlist, resolve DNS and block private/link-local/loopback/metadata IPs, no redirects or re-validate each hop, timeout and size cap → `it('refuses http://169.254.169.254')`

## Admin & internal tools
- Admin route reachable with a normal token → separate guard, deny by default, audit log
- Impersonation without trace → explicit start/stop, log actor and subject, short TTL

## Secrets & PII
- Secret in logs, errors, client bundle, analytics → redact at the logger, `NEXT_PUBLIC_` only for public values
- Over-broad responses (hash, tokens, internal ids) → response DTOs with an explicit field list
- Backup/export leaking PII → access control and expiry on exports

## AI / LLM features
- Prompt injection from user or retrieved content triggers tools or leaks data → treat model output and retrieved text as untrusted; least-privilege tools; confirm destructive actions; no secrets in prompts
- Cross-tenant retrieval (vector store without tenant filter) → tenant filter enforced at query time
- Cost abuse (unbounded tokens/requests) → per-user quotas, max tokens, rate limits
- Output rendered as HTML/markdown → sanitize before render
