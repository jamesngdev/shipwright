# Postgres in Go: pgx + sqlc

## Pool
```go
cfg, _ := pgxpool.ParseConfig(url)
cfg.MaxConns = 10; cfg.MinConns = 2; cfg.MaxConnLifetime = time.Hour
pool, err := pgxpool.NewWithConfig(ctx, cfg)
```
Total `MaxConns` across replicas < server `max_connections` (or use PgBouncer; then avoid session features/prepared statement caching: `default_query_exec_mode=simple_protocol` or `cache_describe`).

## sqlc workflow
```
db/migrations/0001_init.up.sql      # golang-migrate / goose / atlas
db/queries/orders.sql               -- name: GetOrder :one  SELECT ... WHERE id = $1;
sqlc.yaml  (engine postgresql, sql_package pgx/v5, emit_json_tags false)
```
```bash
sqlc generate && git diff --exit-code   # CI: generated code must be committed and current
```
- Name queries by intent (`:one`, `:many`, `:exec`, `:execrows`). Select explicit columns, never `SELECT *` (schema drift breaks scans silently).
- Dynamic filters: sqlc.narg + `WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))`; avoid string-building SQL.
- Wrap the generated `Queries` in a store type that implements the service's interface and translates errors:
```go
o, err := q.GetOrder(ctx, id)
if errors.Is(err, pgx.ErrNoRows) { return Order{}, ErrNotFound }
var pgErr *pgconn.PgError
if errors.As(err, &pgErr) && pgErr.Code == "23505" { return ErrConflict }   // 23503 FK, 40001/40P01 retry
```

## Transactions
```go
func (s *Store) InTx(ctx context.Context, fn func(q *sqlc.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil { return err }
	defer tx.Rollback(ctx) // no-op after commit
	if err := fn(s.q.WithTx(tx)); err != nil { return err }
	return tx.Commit(ctx)
}
```
- Short, DB-only. Retry the whole function on serialization failure (`40001`) / deadlock (`40P01`).
- Contended counters/balances: single atomic `UPDATE ... SET balance = balance - $1 WHERE id=$2 AND balance >= $1` and check rows affected; or `SELECT ... FOR UPDATE`.
- Lock ordering consistent across code paths to avoid deadlocks.

## Pagination (keyset)
```sql
-- name: ListOrders :many
SELECT id, created_at, status FROM orders
WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT $3;
```
Cap limit server-side; return `next_cursor` from the last row. Avoid deep `OFFSET`.

## Bulk & N+1
- Batch: `WHERE id = ANY($1::uuid[])`, `pgx.CopyFrom` for bulk inserts, `pgx.Batch` to pipeline independent statements.
- Never query inside a loop over rows; join or `ANY`.

## Schema/migrations
- Migrations forward-only, reviewed, one concern each; destructive changes via expand/contract; `CREATE INDEX CONCURRENTLY` outside a transaction.
- Index FKs and filtered/sorted columns; `timestamptz` not `timestamp`; `numeric`/int cents for money; `uuid` default `gen_random_uuid()`.
- Run migrations as a deploy step, not racing in every replica.

## Types
`pgtype.Text`/`*string` for nullable; sqlc override for `uuid` -> `google/uuid`, `timestamptz` -> `time.Time`.

## Checklist
- [ ] ctx on every query; ErrNoRows and 23505 mapped
- [ ] no SQL string concat; explicit columns
- [ ] tx short with deferred Rollback
- [ ] keyset pagination with cap; no loop queries
- [ ] sqlc generate is clean in CI
