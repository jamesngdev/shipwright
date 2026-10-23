---
name: frontend
description: Use when the repo or task involves a web frontend: React, Next.js, TypeScript UI, Tailwind/CSS, accessibility, component tests (Vitest/Testing Library), or Playwright verification.
---

# Frontend rules

Priority order when trading off: correctness + a11y > eliminating waterfalls > bundle size > re-renders > micro-optimizations.

## Data & rendering (biggest wins first)
- Kill request waterfalls: start independent fetches together (`Promise.all`, parallel server components, preload); await late, only where used.
- Next.js App Router: server components by default; `"use client"` only at the interactive leaf. Pass client components the minimum serialized props (never whole DB rows).
- Dedupe per-request fetches with `React.cache`; stream with `<Suspense>` boundaries around slow data instead of blocking the page.
- Client fetching: TanStack Query/SWR (cache, dedupe, retry, abort), never `useEffect` + `fetch` + `setState` by hand.
- Mutations: invalidate/patch cache; optimistic update only with rollback on error.
- Every async UI has loading, empty, and error states; errors are shown, not swallowed.

## Bundle
- No barrel-file imports from big libs (`import x from 'lib/x'`, or `optimizePackageImports`).
- `next/dynamic` / `React.lazy` for heavy, below-the-fold or interaction-gated components (editors, charts, modals).
- Load analytics/third-party after hydration. Check size: `ANALYZE=true next build` (bundle-analyzer).
- `next/image` with width/height (or `fill` + sized parent) and `priority` only for the LCP image; `next/font`.

## State & re-renders
- State lives as low as possible; derive instead of syncing (`const total = items.reduce(...)`, no `useEffect` that sets derived state).
- Server state != client state: don't copy query data into `useState`.
- Subscribe to the slice you need (selector / derived boolean), not the whole store.
- `useEffect` is for syncing with external systems only; effects need cleanup and primitive deps. Event logic goes in handlers.
- Functional `setState(prev => ...)`; lazy init `useState(() => expensive())`; `startTransition` for non-urgent updates.
- Memoize only after measuring (React Profiler); stable `key`s (never array index for reorderable lists); hoist static JSX/constants out of components.
- Conditionals: `cond ? <X/> : null`, never `{count && <X/>}` (renders `0`).

## TypeScript
- `strict`; no `any` (use `unknown` + narrowing); parse external data at the boundary with zod and infer types from the schema.
- Props are typed objects; discriminated unions for variant state, not boolean piles.

## Accessibility (non-negotiable)
- Semantic HTML first (`button`, `a`, `nav`, `main`, `label`); `div onClick` is a bug. Details: [a11y-design.md](references/a11y-design.md).
- Every input has a label; every image has `alt` (or `alt=""`); focus is visible and never trapped; keyboard-only operable; contrast >= 4.5:1.
- Respect `prefers-reduced-motion`; animate `transform`/`opacity` only.

## Testing (tiered TDD)
- Test first: hooks/utilities/state logic and every bug fix (reproduce red first). Components with behavior: Testing Library. Config/styling/wiring: no TDD.
- Query by role/label/text (what users perceive), not class names or test ids unless unavoidable; `userEvent`, not `fireEvent`; `findBy*` for async, never sleeps.
- Mock the network at the boundary (MSW), not the data hook. Integration with a real backend/Postgres happens in the API/Playwright tier.
- Coverage >= 80% on changed files; commands in [testing.md](references/testing.md).

## Playwright verification (UI changes)
- After build + dev server on a random free port: headless run that collects console errors, failed requests (>=400), and screenshots (desktop + 375px mobile); read screenshots only on failure or for visual comparison. Script: [playwright-verify.md](references/playwright-verify.md).

## References
| Load when | File |
|---|---|
| Slow page, waterfalls, bundle, server components, caching | [react-performance.md](references/react-performance.md) |
| Fetching, mutations, forms, state libraries, URL state | [data-state.md](references/data-state.md) |
| Building/reviewing UI: a11y, forms, focus, layout, motion, perf of UI | [a11y-design.md](references/a11y-design.md) |
| Component/hook/unit tests, MSW, coverage commands | [testing.md](references/testing.md) |
| Browser verification script, e2e specs, flakiness, visual checks | [playwright-verify.md](references/playwright-verify.md) |
| Next.js routing, caching, server actions, middleware, SEO | [nextjs.md](references/nextjs.md) |
