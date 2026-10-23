# Testing (Node/NestJS)

## Tiers
| Code | Approach |
|---|---|
| service / domain logic | TDD: failing test first, mock repositories |
| bug fix | reproduce with a failing test first, then fix |
| endpoint | integration/e2e (supertest) against real Postgres |
| config, DTO, module wiring | no TDD needed (covered incidentally) |

Real Postgres for anything touching the DB (query shape, constraints, transactions and error codes like `P2002` are invisible to mocks). Never replace Postgres with SQLite or a mocked Prisma client in integration tests.

## Unit test (mock the repository, not Prisma)
```ts
const repo = { findById: jest.fn(), create: jest.fn() };
const mod = await Test.createTestingModule({
  providers: [OrdersService, { provide: OrdersRepository, useValue: repo }] }).compile();
it('rejects duplicate', async () => {
  repo.create.mockRejectedValue(Object.assign(new Error(), { code: 'P2002' }));
  await expect(svc.create(dto)).rejects.toBeInstanceOf(ConflictException);
});
```
Assert behavior and outputs, not call counts of internals. One reason to fail per test.

## Integration/e2e
```ts
beforeAll(async () => {
  app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true })); // same as main.ts
  await app.init();
});
beforeEach(() => prisma.$executeRawUnsafe('TRUNCATE "Order","User" RESTART IDENTITY CASCADE'));
it('POST /orders 400 on bad body', () => request(app.getHttpServer()).post('/orders').send({}).expect(400));
```
- `DATABASE_URL` points at the worktree/test DB; apply schema with `prisma migrate deploy` (or `db push` for a throwaway test DB) before the run.
- Isolate by truncating between tests (or one transaction per test); run DB suites with `--runInBand`/single worker unless each worker has its own schema.
- Cover per endpoint: success, 400 (validation), 401, 403/ownership, 404, 409. Auth: sign a real test token or override the guard in the test module only.
- Freeze time/random (`jest.useFakeTimers`, inject clock) instead of sleeping.

## Commands (use the repo's runner; detect from package.json)
```bash
# Jest
npx jest --coverage --collectCoverageFrom='src/orders/**/*.ts' --coverageThreshold='{"global":{"lines":80}}'
npx jest --findRelatedTests $(git diff --name-only origin/master... | grep '\.ts$') --coverage
npx jest --config test/jest-e2e.json --runInBand
# Vitest
npx vitest run --coverage --coverage.include='src/orders/**' --coverage.thresholds.lines=80
```
Changed-file coverage: read `coverage/coverage-summary.json` (`--coverageReporters=json-summary`) and check each changed file >= 80% lines/branches, not only the global total.

## Smells
- Test passes with the implementation deleted -> asserts nothing.
- Mocking the unit under test; mocking Prisma in an "integration" test.
- Shared mutable fixtures between tests; order-dependent tests.
- `setTimeout` waits; unhandled promise in test body (always `await`/return).

## Checklist
- [ ] red before green for logic/bug fixes
- [ ] endpoint tests cover error statuses
- [ ] DB tests on real Postgres, cleaned between tests
- [ ] changed files >= 80% coverage; full suite green
