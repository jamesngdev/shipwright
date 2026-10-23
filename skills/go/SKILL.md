---
name: go
description: Use when the repo or task involves a Go service: go.mod, net/http or chi/gin handlers, pgx/sqlc, goroutines, Go tests, golangci-lint.
---

# Go service rules

## Layout & design
- Follow the repo's existing layout. Default: `cmd/<app>/main.go` (wiring only), `internal/<domain>/` (handler, service, store), `internal/platform/` (db, config, logger). Avoid `pkg/` unless exporting a library.
- Accept interfaces, return structs; define interfaces where they are consumed (the service package), small (1-3 methods). No interface until a second implementation or a test needs one.
- Dependencies are constructor args; no globals, no `init()` side effects.
- `main` builds config -> db -> services -> router, then runs the server with graceful shutdown (`signal.NotifyContext`, `srv.Shutdown(ctx)`).

## Errors
- Wrap with context: `fmt.Errorf("load order %s: %w", id, err)`. Lowercase, no trailing punctuation.
- Sentinel/typed errors for domain outcomes (`ErrNotFound`); check with `errors.Is/As`, never string-match.
- Handle each error once: either return it or log it, not both. Map to HTTP status only at the handler edge.
- Never ignore errors (`_ =` needs a comment). `defer rows.Close()` right after the error check.
- Panics only for programmer errors; recover in a top-level HTTP middleware.

## Context
- `ctx context.Context` is the first param of anything doing I/O; never store it in a struct; never pass `nil`.
- Derive per-call timeouts (`context.WithTimeout`) and always `defer cancel()`.
- Use `r.Context()` in handlers so client disconnects cancel DB work. Context values only for request-scoped metadata (request id), not for optional params.

## Concurrency
- Every goroutine has an owner and a stop condition; no fire-and-forget in request paths.
- `errgroup.WithContext` for fan-out with first-error cancel; `g.SetLimit(n)` to bound.
- Sender closes channels; guard shared state with `sync.Mutex` (keep critical sections tiny) or confine to one goroutine; `go test -race` must be clean.
- Go 1.22+: loop vars are per-iteration; on older go.mod, copy them before capturing.
- Details: [concurrency.md](references/concurrency.md).

## Database (pgx / sqlc)
- `pgxpool` created once, sized explicitly; pass `ctx` to every query. SQL lives in `.sql` files compiled by sqlc, or parameterized (`$1`) strings; never `fmt.Sprintf` into SQL.
- Map `pgx.ErrNoRows` -> domain `ErrNotFound`; unique violation (`23505`) -> conflict.
- Transactions: `tx, _ := pool.Begin(ctx); defer tx.Rollback(ctx)` ... `tx.Commit(ctx)`; no network calls inside.
- Details: [data.md](references/data.md).

## HTTP
- `http.Server` with `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, `IdleTimeout`; `http.MaxBytesReader` on bodies; `json.Decoder.DisallowUnknownFields()` for strict input.
- Handlers: decode -> validate -> call service -> map error -> encode. No business logic.
- Outbound `http.Client` with `Timeout`; reuse one client; always close `resp.Body`.

## Testing (tiered TDD)
- Test first: domain/service logic and every bug fix (reproduce red first). Handlers: `httptest` + real Postgres integration. Config/wiring: no TDD.
- Table-driven tests with `t.Run`, `t.Parallel()` only when state is isolated; `t.Helper()`, `t.Cleanup()`.
- Unit tests fake the store interface (hand-written fakes over mock frameworks). Integration tests use real Postgres (worktree DB or testcontainers), never sqlite/mocked pgx.
- Gate: `golangci-lint run` -> `go vet ./...` -> `go test -race -cover ./...`; coverage >= 80% on changed packages/files.
- Commands & patterns: [testing.md](references/testing.md).

## Review smells
`interface{}`/`any` in public APIs - naked goroutines - `time.Sleep` in tests - `log.Fatal` outside main - returning concrete error types as `error` nil-pointer trap - copying `sync.Mutex` - unbounded `append`/maps in long-lived state - missing `defer cancel()`.

## References
| Load when | File |
|---|---|
| Goroutines, channels, worker pools, shutdown, races | [concurrency.md](references/concurrency.md) |
| pgx, sqlc, migrations, transactions, pagination | [data.md](references/data.md) |
| Writing tests, httptest, testcontainers, lint, coverage | [testing.md](references/testing.md) |
| Handler/service/store skeleton, config, middleware | [service-skeleton.md](references/service-skeleton.md) |
