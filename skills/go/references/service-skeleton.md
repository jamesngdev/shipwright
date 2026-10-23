# Service skeleton (net/http, Go 1.22+ mux)

## main.go: wiring + graceful shutdown
```go
func main() {
	if err := run(); err != nil { slog.Error("fatal", "err", err); os.Exit(1) }
}

func run() error {
	cfg, err := config.Load() // env -> struct; return error listing missing vars
	if err != nil { return err }
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil { return fmt.Errorf("db: %w", err) }
	defer pool.Close()

	svc := orders.NewService(orders.NewStore(pool))
	mux := http.NewServeMux()
	orders.NewHandler(svc).Routes(mux)
	srv := &http.Server{Addr: ":" + cfg.Port, Handler: middleware.Chain(mux),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}

	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	select {
	case err := <-errc: return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx) // drains in-flight requests
}
```
Port from env so parallel dev servers can use random ports.

## Service owns the interface it consumes
```go
type Store interface {
	Get(ctx context.Context, id string) (Order, error)
	Create(ctx context.Context, o Order) error
}
var ErrNotFound = errors.New("order not found")

type Service struct{ store Store }
func NewService(s Store) *Service { return &Service{store: s} }
```

## Handler: decode -> validate -> service -> map -> encode
```go
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	o, err := h.svc.Get(r.Context(), r.PathValue("id"))
	switch {
	case errors.Is(err, ErrNotFound): writeErr(w, http.StatusNotFound, "NOT_FOUND", "order not found")
	case err != nil: h.log.Error("get order", "err", err); writeErr(w, 500, "INTERNAL", "internal error")
	default: writeJSON(w, http.StatusOK, toResponse(o))
	}
}
func (h *Handler) Routes(m *http.ServeMux) { m.HandleFunc("GET /orders/{id}", h.get) }
```
- Response structs are separate from DB models (`toResponse`); json tags explicit; never serialize DB rows with secrets.
- Decode body: `http.MaxBytesReader(w, r.Body, 1<<20)` then `dec.DisallowUnknownFields()`.
- Same error envelope for every failure; log with request id; no internal error text to clients.

## Middleware (outermost first)
request id -> recover -> access log (slog, status + duration) -> auth -> rate limit. Recover logs the stack and returns 500.

## Config
Struct from env, validated at start (required vars, parsed durations/ints). No viper unless the repo already uses it. Secrets never logged (implement `LogValue`/redact).

## Logging
`log/slog` JSON handler, key-value pairs, request id from context. No `fmt.Println`.

## Observability
`/healthz` (process up), `/readyz` (`pool.Ping(ctx)` with short timeout). Expose Prometheus metrics if the repo already does.
