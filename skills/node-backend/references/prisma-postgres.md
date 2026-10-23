# Prisma + PostgreSQL

Mental model: learn SQL first; Prisma hides it, it does not replace it. Slow endpoint -> read the SQL (`log: ['query']`) and `EXPLAIN ANALYZE` before blaming the ORM.

## Query rules (rule -> why -> snippet)
**No query in loops.** One round trip beats N.
```ts
// BAD
for (const u of users) await prisma.post.findMany({ where: { userId: u.id } });
// GOOD
const posts = await prisma.post.findMany({ where: { userId: { in: ids } }, select: postSelect });
```
**Share `select`.** Prevents over-fetch and secret leaks.
```ts
export const userSelect = Prisma.validator<Prisma.UserSelect>()({ id: true, name: true, email: true });
```
**Single row** -> `findUnique`/`findFirst`, never `findMany()[0]`.
**Cursor pagination** (deep `skip` scans and discards rows):
```ts
prisma.order.findMany({ take: 20, ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select });
```
Always include a unique tiebreaker in `orderBy`, else pages overlap/skip.
**Bulk**: `createMany`, `updateMany`, `deleteMany`; chunk huge batches (~1000) to stay under parameter limits (32767).
**Count**: `count()` over a big table is a seq scan; for UIs return `hasMore` (fetch `take+1`) instead of totals when possible.

## Concurrency
- Read-modify-write is a race. Use atomic ops:
```ts
const { count } = await prisma.account.updateMany({
  where: { id, balance: { gte: amt } }, data: { balance: { decrement: amt } } });
if (count === 0) throw new ConflictException('insufficient funds');
```
- Uniqueness: rely on `@unique` + catch `P2002` (check-then-insert races). Idempotent upsert: `upsert` on a unique key.
- Need row locks: `SELECT ... FOR UPDATE` via `$queryRaw` inside `$transaction`. Use `Serializable` only with retry on `P2034`.

## Transactions
- Interactive `$transaction(async tx => ...)` has a 5s default timeout; keep it to DB work only. HTTP/Redis/email after commit.
- Use `tx.` inside the callback, never the outer `prisma` (silently runs outside the transaction).

## Schema
```prisma
model Order {
  id        String      @id @default(uuid())
  userId    String
  status    OrderStatus @default(PENDING)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  user      User        @relation(fields: [userId], references: [id])
  @@index([userId, status])
  @@index([createdAt])
}
```
- Enum for fixed states; money as `Decimal` or integer minor units, never `Float`.
- Relation tables instead of `Int[]` of ids; `Json` only for truly dynamic shape.
- Index: every FK, frequent filters/sorts; partial/unique-where via raw migration SQL when needed. Indexes cost writes: add intentionally.
- Soft delete (`deletedAt`) means every query must filter it: centralize in the repository or a client extension.

## Migrations
- `prisma migrate dev` locally; `prisma migrate deploy` in CI/prod; never `db push` against shared DBs.
- Never edit an applied migration. Review generated SQL (`prisma migrate diff`).
- Destructive/locking changes: add nullable column -> backfill in batches -> add NOT NULL/constraint later (`CREATE INDEX CONCURRENTLY` via manual SQL, no transaction).
- Schema change = regenerate client (`prisma generate`); worktrees must not share a generated client.

## Connections
- Pool size = `connection_limit` in `DATABASE_URL`; instances x limit must stay under Postgres `max_connections`. Serverless/many pods -> PgBouncer (`?pgbouncer=true`) or Accelerate.
- Disconnect on shutdown (`enableShutdownHooks`).

## Errors
`P2002` unique -> 409, `P2025` not found -> 404, `P2003` FK -> 400/409, `P2034` write conflict/deadlock -> retry.

## Debug
```bash
# psql: find the slow query shape
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;   # Seq Scan on a big table = missing index
SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

## Checklist
- [ ] no prisma call in loops; `select` narrow; DTO returned
- [ ] `take` cap + deterministic `orderBy`
- [ ] contended writes atomic; `P2002`/`P2025` mapped
- [ ] new filters/FKs indexed; migration reviewed and non-blocking
- [ ] transaction free of external calls
