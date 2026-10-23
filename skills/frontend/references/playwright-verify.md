# Playwright headless verification

Purpose: prove a UI change works in a real browser, cheaply. Run after build + dev server start (random free port, `BASE_URL` env). Screenshots are expensive to read: look only on failure or when comparing UI.

## One-shot verification script (no test suite required)
```ts
// verify-ui.mjs   run: BASE_URL=http://localhost:41873 node verify-ui.mjs /orders /settings
import { chromium } from 'playwright';
const base = process.env.BASE_URL, paths = process.argv.slice(2);
const browser = await chromium.launch();
const issues = [];
for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 375, height: 812 }]]) {
  const ctx = await browser.newContext({ viewport, storageState: process.env.AUTH_STATE });
  const page = await ctx.newPage();
  page.on('console', m => m.type() === 'error' && issues.push(`[console] ${page.url()} ${m.text()}`));
  page.on('pageerror', e => issues.push(`[pageerror] ${page.url()} ${e.message}`));
  page.on('requestfailed', r => issues.push(`[reqfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => r.status() >= 400 && issues.push(`[http ${r.status()}] ${r.url()}`));
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) issues.push(`[overflow-x] ${p} @${name}`);
    await page.screenshot({ path: `.sw-shots/${name}${p.replace(/\//g, '_')}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(issues.length ? issues.join('\n') : 'OK: no console errors, failed requests, or overflow');
process.exit(issues.length ? 1 : 0);
```
Install if missing: `npm i -D playwright && npx playwright install chromium`. Add `.sw-shots/` to `.gitignore`.
Expected 4xx (e.g. a tested 401) -> filter those URLs rather than ignoring all.

## Specs for flows (`@playwright/test`)
```ts
test('user cancels an order', async ({ page }) => {
  await page.goto('/orders');
  await page.getByRole('row', { name: /#1042/ }).getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('status')).toHaveText(/cancelled/i);   // auto-waits
  await expect(page.getByRole('row', { name: /#1042/ })).toContainText('Cancelled');
});
```
- Locators: `getByRole` > `getByLabel` > `getByText` > `getByTestId`. Never CSS chains or XPath.
- Assertions are web-first (`expect(locator)...`) and auto-retry; never `waitForTimeout`.
- Each test independent: own data via API/DB seeding in `beforeEach`, not UI clicks; own login via saved `storageState` (`globalSetup` logs in once).
- Network: wait on the specific response (`page.waitForResponse`) or assert UI; stub third parties with `page.route`, not your own API.
- Check API contract in the same flow: `const [res] = await Promise.all([page.waitForResponse('**/api/orders/*'), click])`; `expect(res.status()).toBe(200)`.
- a11y: `const r = await new AxeBuilder({ page }).analyze(); expect(r.violations).toEqual([])`.

## Config essentials
```ts
export default defineConfig({
  testDir: 'e2e', fullyParallel: true, retries: process.env.CI ? 2 : 0, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }, { name: 'mobile', use: devices['iPhone 13'] }],
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run dev -- -p 41873', url: 'http://localhost:41873', reuseExistingServer: true },
});
```
Commands: `npx playwright test`, `--project=chromium`, `-g "cancels"`, `--ui` (local), `npx playwright show-trace trace.zip`, `npx playwright test --update-snapshots` (only after intentionally reviewing diffs).

## Flakiness checklist
- Race on hydration: wait for an interactive element via `expect(...).toBeEnabled()`, not for `networkidle` only.
- Animations: `reducedMotion: 'reduce'` in context; mask dynamic regions in screenshot comparisons (`mask: [locator]`).
- Time/random: `page.clock` / fixed seeds; avoid real "now".
- Shared state between tests, order dependence, ports hard-coded.
- Reproduce: `--repeat-each=10 --workers=1`.

## Reporting
Return a compact table: path x viewport -> console errors / failed requests / overflow / a11y violations, plus screenshot paths for failures only.
