# Performance review lens

Scope: the branch diff. First decide call frequency: request hot path, list endpoint, cron/worker, or one-off script; severity depends on it. State impact quantitatively ("1 query becomes N for a 100-item page", "adds ~120 KB to first load").
Severity: **B** = clear regression on a hot path, **W** = probable regression or rule violation with unclear reachability, **I** = optimization opportunity.

## Ordered checklist (backend)
1. **N+1 / query in loop (B on hot path).** One query per element instead of `IN`/join/include.
   Detect: `await` on DB/Redis/HTTP inside `for|while|map|forEach|reduce` (`for.*\n.*await prisma\.`); Go `for _, x := range` containing `db.|q.|pool.Query`; ORM lazy relation access in a loop; Redis `get` per id (use `mget`/pipeline).
2. **Unbounded read (B).** List query without `take`/`LIMIT`; loading a table to filter in app code; no page-size clamp.
   Detect: `findMany\(` without `take`; `SELECT` without `LIMIT` on a growing table; `.find(` / `.filter(` over full result; `limit` taken straight from query params.
3. **Missing index (B/W).** New `where`/`orderBy`/join/FK column with no index in the same diff.
   Detect: diff touches `schema.prisma`/migrations vs new query columns; `EXPLAIN (ANALYZE, BUFFERS)` shows `Seq Scan` on a large table; composite filter without composite index; `LIKE '%x%'`, function on indexed column (`lower(email)` needs a functional index).
4. **Deep offset pagination (W).** `skip: N` with large/unbounded N, `OFFSET` over big tables.
   Detect: `skip:` fed by page*size; `OFFSET \$`. Fix: keyset/cursor with a unique tiebreaker.
5. **Over-fetching / payload bloat (W).** `include` of big relations, `SELECT *`, returning full objects, large JSON blobs, missing compression/pagination.
   Detect: `include:` without nested `select`; `select \*`; response mapping that returns whole entities.
6. **Sequential independent awaits (W).** Could be `Promise.all` / `errgroup`.
   Detect: consecutive `const a = await x(); const b = await y();` where y doesn't use a.
7. **Transaction misuse (W/B).** Long transactions holding locks: external calls, Redis, email, uploads inside; whole-request transaction; read-modify-write instead of atomic update (also a correctness bug).
   Detect: `$transaction` / `Begin(` body containing `fetch|axios|http.|redis|sendMail|upload`.
8. **Event-loop / goroutine hazards (B on request path).** Sync fs/crypto/zlib, big `JSON.parse`/`stringify`, heavy regex/CPU loops in handlers; Go unbounded goroutines per request, no `ctx` cancellation, holding a mutex across I/O.
   Detect: `readFileSync|pbkdf2Sync|bcrypt.hashSync|execSync|zlib\.\w+Sync`; `go func` in handlers without limit; `time.Sleep` in request paths.
9. **Cache regressions (W).** Cache removed from a hot read; key can never hit (includes timestamp/random); `set` without TTL; cache-per-item in a loop; writes before DB commit; stampede on a hot key with no jitter/single-flight.
   Detect: `redis.set(` lacking `EX`; keys built with `Date.now()`; `KEYS ` usage; removed `cache.get`.
10. **Connection & resource handling (W/B).** New `new PrismaClient()` per request/module; pool not bounded; unclosed `rows`/`resp.Body`/streams; no outbound timeouts; unbounded retry loops; unbounded in-memory arrays/maps/queues.
    Detect: `new PrismaClient\(`; Go missing `defer rows.Close()` / `resp.Body.Close()`; `axios.create` without `timeout`; module-level `Map` that only grows.
11. **Heavy work on request path (W).** Image/PDF/report generation, emails, webhooks, fan-out calls done inline; cron overlapping itself in multiple instances.
    Detect: handler awaiting third-party/CPU-heavy calls that could be queued (BullMQ/worker); `@Cron` without a lock.
12. **Bulk ops done one-by-one (W).** Per-row insert/update in loops; no `createMany`/`CopyFrom`/batching; huge batches exceeding parameter limits.
    Detect: `create(` / `Exec(` inside loops.

## Frontend checklist (when the diff touches UI)
1. **Waterfalls (B/W).** Sequential independent awaits in server components/loaders; child fetching after parent render. Detect: stair-step requests; `await` chains; fetch in `useEffect` after mount for data needed at render.
2. **Bundle growth (W).** Barrel imports, whole-library imports, heavy deps (`moment`, full `lodash`, big chart/editor) in the main bundle; new client boundary high in the tree. Detect: `import .* from '(lodash|@mui/icons-material|lucide-react)'` root imports; `"use client"` in layout/page files; `next build` First Load JS delta; missing `dynamic()`.
3. **Re-render storms (W).** State too high; derived state in effects; unstable object/array/function props to memoized children; context value recreated each render; list items using index keys. Detect: `useEffect(() => setX(f(y)), [y])`; `value={{`; `key={i}`.
4. **Layout/CLS/LCP (W).** Images without dimensions, LCP image lazy-loaded or not prioritized, un-reserved async content, fonts without `swap`/`next/font`.
5. **Large lists (W).** > ~200 rows rendered without virtualization/pagination; heavy per-row components.
6. **Chatty client (W).** Duplicate identical requests, polling without backoff, no cache `staleTime`, refetch on every focus for static data, missing `AbortSignal`.

## Quick measurement commands
```bash
# Postgres
EXPLAIN (ANALYZE, BUFFERS) <query>;      # Seq Scan on big table, rows removed by filter >> returned
# Prisma: new PrismaClient({ log: ['query'] }) -> count queries per request in a test
# Node CPU/event loop: node --cpu-prof; clinic doctor; autocannon -c 50 -d 20 <url>
# Go
go test -bench . -benchmem ./... ; go tool pprof -http=:0 cpu.out ; go test -race ./...
# Frontend
ANALYZE=true next build ; npx lighthouse <url> --only-categories=performance
```

## Reporting format
`[B|W|I] file:line - what changes - estimated impact - fix (one line)`. Findings without a stated impact are not findings.
