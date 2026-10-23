# Go testing

## Tiers
| Code | Approach |
|---|---|
| domain/service logic | TDD, table-driven, fake store |
| bug fix | failing regression test first |
| HTTP handlers/endpoints | `httptest` + real Postgres integration |
| config/wiring/main | no TDD |

## Table-driven
```go
func TestDiscount(t *testing.T) {
	tests := []struct {
		name    string
		in      Order
		want    int64
		wantErr error
	}{
		{"no items", Order{}, 0, ErrEmpty},
		{"10% over 100", Order{Total: 200}, 20, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Discount(tc.in)
			if !errors.Is(err, tc.wantErr) { t.Fatalf("err = %v, want %v", err, tc.wantErr) }
			if got != tc.want { t.Errorf("got %d, want %d", got, tc.want) }
		})
	}
}
```
- Compare with `cmp.Diff(want, got)` (go-cmp) for structs; failure messages say got/want.
- Fakes: small hand-written struct implementing the consumer interface (in-memory map); function-field fakes for error injection.
- Time/random/ID injected (`Clock func() time.Time`), never `time.Sleep`; use channels/`require.Eventually` for async.
- `t.Parallel()` only when tests share no state.

## Handlers with httptest
```go
srv := httptest.NewServer(NewRouter(svc))       // or httptest.NewRecorder for pure handler tests
t.Cleanup(srv.Close)
req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"sku":""}`))
rec := httptest.NewRecorder(); handler.ServeHTTP(rec, req)
if rec.Code != http.StatusBadRequest { t.Fatalf("code=%d body=%s", rec.Code, rec.Body) }
```
Per endpoint: success, 400, 401/403, 404, 409. Assert body shape (error code), not just status.

## Real Postgres integration
Option A (worktree/dev DB): `TEST_DATABASE_URL` from env; skip if unset: `if os.Getenv("TEST_DATABASE_URL")=="" { t.Skip() }`. Migrate once in `TestMain`; isolate per test with a transaction rolled back in `t.Cleanup`, or `TRUNCATE ... RESTART IDENTITY CASCADE`.
Option B (testcontainers):
```go
func TestMain(m *testing.M) {
	ctx := context.Background()
	pg, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("test"), postgres.WithUsername("u"), postgres.WithPassword("p"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2)))
	if err != nil { log.Fatal(err) }
	url, _ := pg.ConnectionString(ctx, "sslmode=disable")
	testPool = mustMigrateAndConnect(ctx, url)
	code := m.Run()
	pg.Terminate(ctx)
	os.Exit(code)
}
```
Container reused across the package (one per package, not per test). Tag slow suites `//go:build integration` and run with `-tags=integration`.

## Commands
```bash
golangci-lint run ./...                         # config in .golangci.yml; keep: errcheck govet staticcheck revive gosec bodyclose errorlint
go vet ./...
go test -race -cover ./...
go test -race -covermode=atomic -coverprofile=cover.out ./internal/orders/...
go tool cover -func=cover.out | tail -n 20      # per-function; verify changed files >= 80%
go tool cover -html=cover.out -o cover.html
go test -run TestX -count=1 -v ./pkg            # -count=1 bypasses test cache
go test -tags=integration -race ./...
```
`-race` needs cgo; run it in CI at least. Fuzz parsers/validators: `func FuzzParse(f *testing.F)`.

## Smells
- Test asserts only `err == nil`. - Mocking frameworks for 2-method interfaces. - Shared package-level DB state across parallel tests. - Skipped tests without a reason. - Coverage chasing on generated sqlc code (exclude `db/sqlc` from the threshold).

## Checklist
- [ ] red before green; table-driven with names
- [ ] integration on real Postgres; cleanup guaranteed
- [ ] lint + vet + race + cover >= 80% on changed code
