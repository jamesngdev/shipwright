# Concurrency

## Rules -> why
- Don't start a goroutine you can't stop: leaks accumulate until OOM. Owner passes a `ctx` and waits (`WaitGroup`/`errgroup`).
- Prefer synchronous APIs; let the caller add concurrency. Async by default makes lifetimes unclear.
- Share memory by communicating only when it simplifies; a mutex is fine for a cache/counter.
- Channel direction in signatures (`<-chan T`, `chan<- T`). Only the sender closes. Receiving from a closed channel yields zero values: use `v, ok :=` or `range`.
- Unbuffered unless you can justify the buffer size; buffers hide backpressure bugs.

## errgroup fan-out (bounded, cancel on first error)
```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(8)
for _, id := range ids {
	g.Go(func() error {            // Go 1.22: id is per-iteration
		return process(ctx, id)
	})
}
if err := g.Wait(); err != nil { return err }
```
Writing results: preallocate `out := make([]R, len(ids))` and write `out[i]` (no lock needed), or send on a channel.

## Worker pool
```go
jobs := make(chan Job)
var wg sync.WaitGroup
for range n {
	wg.Add(1)
	go func() { defer wg.Done(); for j := range jobs { handle(ctx, j) } }()
}
feed: for _, j := range all {
	select { case jobs <- j: case <-ctx.Done(): break feed }
}
close(jobs); wg.Wait()
```

## Select with cancellation (every blocking op)
```go
select {
case res := <-ch: return res, nil
case <-ctx.Done(): return zero, ctx.Err()
}
```
`time.After` in a loop leaks timers pre-1.23: use `time.NewTimer` + `Reset`/`Stop`, or `time.Ticker` with `defer t.Stop()`.

## Shared state
- `sync.Mutex`: lock, `defer Unlock`, tiny critical section, never hold across I/O or channel ops. Never copy a struct containing a mutex (vet catches it).
- `sync.RWMutex` only when reads dominate and measured. `atomic.Int64` for counters. `sync.Once`/`OnceValue` for lazy init.
- `sync.Map` only for write-once-read-many or disjoint keys; otherwise map + mutex.
- `singleflight.Group` collapses duplicate concurrent loads (cache stampede).

## Retries / timeouts
Retry only idempotent operations, with exponential backoff + jitter, bounded attempts, and `ctx` checked between tries. Timeout every outbound call.

## Detecting problems
```bash
go test -race ./...                 # data races (CI must run this)
go test -run X -count=100 -race     # flush flaky concurrency tests
GODEBUG=gctrace=1 ./app             # GC pressure
go tool pprof http://localhost:6060/debug/pprof/goroutine   # leaks (net/http/pprof on a private port)
go.uber.org/goleak                  # goleak.VerifyNone(t) in TestMain
```

## Checklist
- [ ] each goroutine has owner, ctx, and exit path
- [ ] bounded parallelism (SetLimit/pool)
- [ ] sender closes channel; selects honor ctx.Done
- [ ] no lock held across I/O; race detector clean
