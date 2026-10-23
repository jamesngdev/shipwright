# Redis / cache patterns (ioredis)

Mental model: cache is an optimization, never the source of truth. Design for miss, for Redis being down, and for invalidation first.

## Cache service: resilience lives inside
```ts
async get<T>(key: string): Promise<T | null> {
  try { const raw = await this.redis.get(key); return raw ? JSON.parse(raw) : null; }
  catch (e) { this.logger.warn(`cache get ${key}: ${(e as Error).message}`); return null; } // miss, never throw
}
async set<T>(key: string, v: T, ttlSec: number) {          // ttl is required, not optional
  try { await this.redis.set(key, JSON.stringify(v), 'EX', ttlSec); } catch (e) { /* warn */ }
}
```
Log key + error only, never the value (tokens/PII).
Set `maxRetriesPerRequest` and `commandTimeout` so a dead Redis fails fast instead of hanging requests.

## Cache-aside + stampede control
```ts
const ttl = 300 + Math.floor(Math.random() * 60);        // jitter avoids synchronized expiry
const hit = await cache.get<Profile>(key); if (hit) return hit;
const row = await repo.findProfile(id); await cache.set(key, row, ttl); return row;
```
- Hot key expiring under load: single-flight with `SET lock:{key} 1 NX EX 10`, losers wait/serve stale or hit DB once.
- Cache negative results (not found) with a short TTL to stop penetration.
- Write path: DB commit first, then `del` the key (or write-through). Never cache before commit.

## Keys
- `v1:<entity>:<id>:<view>`; bump `v1`->`v2` when the shape changes. Per-environment/worktree prefix or separate db index so parallel runs don't collide.
- Delete by pattern with `SCAN` + `UNLINK` in batches, never `KEYS`.
```ts
for await (const keys of redis.scanStream({ match: 'v1:user:*', count: 500 })) if (keys.length) await redis.unlink(...keys);
```

## Structures
String (blob/counter), Hash (object fields, partial update), Set (membership), ZSet (leaderboard, time windows, delayed jobs), Stream (event log). Don't JSON-blob what a Hash fits. Multi-key ops: `pipeline()`/`mget`, not loops.

## Common recipes
- Rate limit: `INCR k` + `EXPIRE k win` on first hit (use a Lua script/`multi` so the expire is atomic); or sliding window with ZSET.
- Distributed lock: `SET k token NX PX 30000`; release via Lua compare-and-del on the token; always a TTL; use for cron/singleton work. A lock is advisory: guard correctness with DB constraints too.
- Idempotency keys: `SET idem:{key} <result|inflight> NX EX 86400`.
- Sessions/refresh tokens: TTL = token lifetime; store hash of the token, not the token.

## BullMQ
- Jobs idempotent; `attempts` + exponential `backoff`; `removeOnComplete: { age, count }`, `removeOnFail` bounded (else Redis memory grows forever).
- Separate connection for workers (`maxRetriesPerRequest: null` is required by BullMQ).
- Graceful shutdown: `await worker.close()`.

## Ops/security
- Auth on, not internet-exposed, ACL per service, `maxmemory` + `allkeys-lru` for pure caches (not for queues/locks: use a separate instance or `noeviction`).
- Track hit/miss counters.

## Checklist
- [ ] every `set` has TTL (+ jitter)  - [ ] no `KEYS`  - [ ] via cache service
- [ ] Redis failure -> DB fallback  - [ ] DB first, then invalidate
- [ ] key versioned/namespaced  - [ ] no secrets/values logged
