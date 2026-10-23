---
name: node-backend
description: Use when the repo or task involves a Node.js/TypeScript backend: NestJS, Prisma/Postgres, Redis/ioredis, BullMQ, Dockerfiles, or REST API design.
---

# Node backend rules

Non-obvious, high-impact rules. Load a reference only when the task touches that area.

## Architecture
- Layers: controller (HTTP only) -> service (business rules, ORM-agnostic) -> repository (only place that knows Prisma/SQL/Redis keys).
- Never return a persistence object from an endpoint; map to a response DTO (raw rows leak `password`, tokens, internal columns).
- Validate every input at the edge (DTO + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`); validate env at boot and fail fast.
- Global exception filter maps domain/Prisma errors to HTTP errors; never leak stack traces or SQL.

## Database (Postgres + Prisma)
- No `await prisma.*` inside loops/`map`/`forEach` (N+1): use `include`, `where: { in }`, `createMany`, or one raw query.
- `select` only needed fields; share one `select` constant per model.
- Every list read has `take` (cap it) and a stable `orderBy`; prefer cursor over deep `skip`.
- Contended writes are atomic (`{ decrement }`, `updateMany` with guard `where`) or versioned; never read-modify-write.
- `$transaction` is short: no HTTP, Redis, email, uploads inside; do side effects after commit.
- Handle `P2002` (conflict -> 409) and `P2025` (not found -> 404).
- `$queryRaw` tagged template only; `$queryRawUnsafe` with input is a blocker.
- Index FKs and every column in a frequent `where`/`orderBy`; composite index order = equality columns first, then range/sort.
- Migrations: never edit an applied one; destructive changes (drop/rename/type) use expand -> migrate -> contract.

## Redis / cache
- Cache is an optimization: reads fall back to DB on any Redis error; never throw to the caller.
- Every key has a TTL (+ jitter); keys are namespaced and versioned (`v1:user:{id}:profile`).
- Write DB first, then invalidate/update cache. `SCAN`, never `KEYS`. Pipeline/`MGET` instead of calls in a loop.
- Go through a cache service, not the raw client. Never log cached values or tokens.

## API design
- Resources are plural kebab-case nouns; HTTP method is the verb. Non-CRUD action: model as state (`PATCH` status) or `POST /orders/{id}:cancel`.
- Status codes carry meaning (never `200` + `success:false`); one error body shape everywhere.
- Lists paginate and cap page size; changes are additive; breaking changes get a new version.
- Create endpoints that must not duplicate (payments, orders) accept `Idempotency-Key`.

## Docker
- Pinned slim base (never `latest`), multi-stage, non-root `USER`, `.dockerignore`, prod deps only, run `node dist/main.js`.
- Health (`/health`) + readiness endpoints, `enableShutdownHooks()`, memory limits.

## Testing (tiered TDD)
- Test first: service/domain logic and every bug fix (reproduce red before fixing).
- Endpoints: integration/e2e (supertest). Config, DTO, wiring: no TDD.
- Unit tests mock repositories. Integration tests hit real Postgres (the worktree DB), never SQLite or a mocked Prisma.
- Coverage >= 80% on changed files; verify per-file, not just the global number.
- Commands: see [testing.md](references/testing.md).

## References
| Load when | File |
|---|---|
| NestJS modules, DI, guards, pipes, config, logging, shutdown | [nestjs.md](references/nestjs.md) |
| Prisma schema, queries, transactions, migrations, pooling | [prisma-postgres.md](references/prisma-postgres.md) |
| Redis cache, rate limit, locks, BullMQ | [redis.md](references/redis.md) |
| Dockerfile, compose, runtime hardening | [docker.md](references/docker.md) |
| Designing/reviewing endpoints, errors, pagination, idempotency | [api-design.md](references/api-design.md) |
| Writing tests, coverage commands, e2e setup | [testing.md](references/testing.md) |
