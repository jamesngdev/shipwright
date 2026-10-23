# REST API design (AIP / RFC 9110 flavored)

Rule zero: model resources (nouns); the method is the verb. `POST /createUser` is RPC-over-HTTP.

## Naming & shape
- Plural kebab-case nouns, id in path: `/payment-methods/{id}`. Filters/sort/search are query params (`/users?status=active`), never new paths.
- Hierarchy <= 2-3 levels; important children also get a top-level route (`/orders/{id}`).
- Singleton per context: `/me`, `/settings`.
- Non-CRUD action: first try state (`PATCH /orders/{id} {"status":"CANCELLED"}`); else custom method `POST /orders/{id}:cancel`.
- JSON fields camelCase (match the existing API); ISO-8601 UTC timestamps; ids as strings; money as integer minor units + currency.

## Methods
| Method | Use | Idempotent | Success |
|---|---|---|---|
| GET | read | yes | 200 |
| POST | create / action | no | 201 + `Location`, or 202 async |
| PUT | full replace | yes | 200/204 |
| PATCH | partial update | should be | 200 |
| DELETE | remove | yes (2nd call 404 or 204, pick one) | 204 |
- PATCH semantic: absent field = unchanged; `null` = clear. Document it. Use an update mask for complex resources.

## Status codes
400 malformed/validation - 401 unauthenticated - 403 authenticated but not allowed - 404 not found (also for resources the caller may not know exist) - 409 conflict/state/duplicate - 422 only if the repo already uses it - 429 rate limited (+ `Retry-After`) - 5xx server fault only.
Never `200` with `{ success:false }`.

## One error body
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Invalid input", "requestId": "...",
  "details": [{ "field": "email", "reason": "must be a valid email" }] } }
```
Stable machine `code` (clients branch on it), human `message`, no stack/SQL.

## Lists
- Always paginate; `limit` default ~20, hard max ~100 (clamp server-side).
- Cursor for feeds/large sets: `?cursor=...&limit=20` -> `{ "items": [...], "nextCursor": "..." | null }`. Offset only for small, admin-style tables.
- Filtering whitelisted per endpoint; sort whitelisted (`sort=-createdAt`); unknown params ignored or 400, be consistent.
- Optional `fields=` for partial responses on heavy resources.

## Idempotency & retries
- Important POSTs (payments, orders): `Idempotency-Key` header; store key -> response for 24h; same key + different body -> 409/422.
- Webhooks inbound: verify signature, dedupe on event id, respond fast and process async.

## Long-running work
`202 Accepted` + `Location: /operations/{id}`; `GET /operations/{id}` -> `{ status: PENDING|RUNNING|SUCCEEDED|FAILED, result?, error? }`.
Batch endpoints: cap size; return per-item results (partial success) with item index.

## Compatibility
- Additive only: new optional request fields, new response fields, new enum values (clients must tolerate unknown).
- Breaking (rename/remove/type change/new required field/semantics): new version (`/v2`) or new field, deprecate with `Deprecation`/`Sunset` headers; keep old for a stated window.
- Mobile clients can't be force-updated: assume old clients live forever.

## Security touchpoints
Auth by default; ownership check on every `{id}`; never trust client-supplied `userId`; rate-limit auth and expensive endpoints; CORS allowlist.

## Review checklist
- [ ] noun URL, right method/status, consistent with siblings
- [ ] pagination + clamp  - [ ] single error shape
- [ ] idempotency for non-repeatable POSTs
- [ ] additive change  - [ ] documented (OpenAPI/llms.txt) incl. error codes
