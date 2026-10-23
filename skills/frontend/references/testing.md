# Frontend testing (Vitest + Testing Library)

## Tiers
| Code | Approach |
|---|---|
| hooks, utils, reducers, validators, state logic | TDD (red first) |
| bug fix | failing regression test first |
| components with behavior (forms, dialogs, lists) | Testing Library, behavior-level |
| pages/flows | Playwright (see playwright-verify.md) |
| styling, layout, config, thin wrappers | no TDD |

## Setup
```ts
// vitest.config.ts
export default defineConfig({ plugins: [react()], test: {
  environment: 'jsdom', globals: true, setupFiles: ['./test/setup.ts'], css: false,
  coverage: { provider: 'v8', reporter: ['text', 'json-summary'], include: ['src/**/*.{ts,tsx}'],
              exclude: ['**/*.d.ts', '**/*.stories.*', 'src/**/index.ts'] } } });
// test/setup.ts
import '@testing-library/jest-dom/vitest';
import { server } from './msw'; beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { cleanup(); server.resetHandlers(); }); afterAll(() => server.close());
```
`onUnhandledRequest: 'error'` surfaces forgotten mocks. Jest repos: same patterns with `jest-environment-jsdom`.

## Component test
```tsx
it('shows server error and re-enables submit', async () => {
  server.use(http.post('/api/login', () => HttpResponse.json({ error: { code: 'BAD_CREDS', message: 'Wrong password' } }, { status: 401 })));
  const user = userEvent.setup();
  render(<LoginForm />, { wrapper: Providers });          // QueryClient with retry:false
  await user.type(screen.getByLabelText(/email/i), 'a@b.co');
  await user.type(screen.getByLabelText(/password/i), 'x');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password');
  expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
});
```
- Query priority: `getByRole(name)` > `getByLabelText` > `getByText` > `getByTestId` (last resort).
- `userEvent.setup()` per test; `findBy*`/`waitFor` for async; `queryBy*` only to assert absence.
- Assert what the user sees/does: text, roles, enabled state, navigation call; not state, props, or CSS classes.
- Fresh `QueryClient({ defaultOptions: { queries: { retry: false } } })` per test; mock network with MSW, not `vi.mock` on your own hooks.
- Hooks: `renderHook` + `act`; pure logic tested without React.
- Time: `vi.useFakeTimers()` for debounce; restore in `afterEach`.
- Next.js: mock `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) in setup; async server components are tested via Playwright or by testing their pure data functions.
- a11y in unit tests: `expect(await axe(container)).toHaveNoViolations()` (vitest-axe) for key components.
- Snapshots: only for small, stable serialized output; never for whole component trees.

## Commands
```bash
npx vitest run                                   # CI mode (no watch)
npx vitest run --coverage --coverage.thresholds.lines=80
npx vitest run --changed origin/master --coverage  # only tests related to changed files
npx vitest related src/a.tsx src/b.ts --run
npx jest --coverage --findRelatedTests <files>   # jest repos
npx tsc --noEmit && npx eslint .                 # typecheck + lint precede tests
```
Check per-file lines/branches >= 80% for changed files in `coverage/coverage-summary.json`.

## Smells
- Test finds nodes by class/`data-testid` everywhere (not user-visible).
- `fireEvent` for typing/clicking; arbitrary `setTimeout`/`waitFor(() => true)`.
- Implementation details asserted (`useState` calls, internal handlers).
- Mocking the component under test or the whole router with behavior.
- Missing cleanup between tests: leaking timers, MSW handlers, QueryClient cache.

## Checklist
- [ ] red before green for logic/bugs
- [ ] role/label queries; userEvent; no sleeps
- [ ] network via MSW; unhandled requests error
- [ ] changed files >= 80%; tsc + lint clean
