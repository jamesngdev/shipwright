# NestJS conventions

## Module layout
```
src/orders/
  orders.module.ts  orders.controller.ts  orders.service.ts  orders.repository.ts
  dto/create-order.dto.ts  dto/order.response.ts
```
- One module per bounded context; export only what other modules need (usually the service).
- Why: services depending on repositories (not `PrismaService`) keep unit tests mockable and ORM details contained.
- Circular module deps (`forwardRef`) signal a wrong boundary; extract a third module or an event instead.

## Bootstrap checklist
```ts
const app = await NestFactory.create(AppModule);
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useGlobalFilters(new AllExceptionsFilter());
app.enableShutdownHooks();          // SIGTERM -> onModuleDestroy closes DB/Redis
app.enableCors({ origin: allowlist });  // never '*' with credentials
app.use(helmet());
await app.listen(config.getOrThrow('PORT'));
```
- `ConfigModule.forRoot({ validate })` with a zod/class-validator schema; `getOrThrow` instead of `get` for required vars.
- Port comes from env (parallel worktrees/dev servers run on random ports).

## Guards, pipes, interceptors
- Auth: global `AuthGuard` + `@Public()` opt-out, so a new endpoint is protected by default (a missing guard is the classic IDOR/auth hole).
- Authorization is a separate check against the resource owner inside the service (`where: { id, ownerId: user.id }`), not only a role guard.
- `ParseUUIDPipe` / `ParseIntPipe` on path params; DTOs with `class-validator` + `@Type()` for numbers/dates in queries.
- `@Transform` for trimming/lowercasing emails belongs in the DTO.

## Errors
```ts
throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email already registered' });
```
- Services throw domain/Nest HTTP exceptions; filter maps unknown errors to 500 with a request id and logs the stack server-side only.
- Never swallow errors in `catch {}`; rethrow or log with context.

## Async & performance
- Independent awaits -> `Promise.all`. Don't block the event loop (sync crypto/fs, huge JSON.parse, heavy regex) on request paths; use `bcrypt` async or worker threads.
- Fire-and-forget work (emails, webhooks) goes to a queue (BullMQ), not an un-awaited promise in the handler.
- Always set timeouts on outbound HTTP (`axios` `timeout`, `AbortSignal.timeout`) and retries only for idempotent calls.

## Logging
- Structured (pino/nestjs-pino), levels, request-id per request; redact `authorization`, `password`, `token`, `cookie`.

## Scheduling / queues
- Cron in multi-instance deployments runs N times: guard with a Redis lock or run in a single worker.
- BullMQ jobs are idempotent; set `attempts`, `backoff`, `removeOnComplete` to avoid unbounded Redis growth.

## Checklist
- [ ] New route is guarded by default; ownership checked
- [ ] DTO validated, whitelist on; response mapped to DTO
- [ ] No ORM types leak past the repository
- [ ] External calls have timeouts; side effects after DB commit
- [ ] Tests: service unit (mock repo) + endpoint e2e
