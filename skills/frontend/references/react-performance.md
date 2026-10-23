# React / Next.js performance (ordered by impact)

## 1. Eliminate waterfalls (critical)
**Parallelize independent work.**
```ts
// BAD: 3 sequential round trips
const user = await getUser(id); const posts = await getPosts(id); const stats = await getStats(id);
// GOOD
const [user, posts, stats] = await Promise.all([getUser(id), getPosts(id), getStats(id)]);
```
**Partial dependencies**: start the promise early, await late.
```ts
const configP = fetchConfig();            // starts now
const user = await getUser(id);
const config = await configP;
```
**Defer await into the branch that needs it** (an early-return path must not pay for data it won't use).
**Component waterfalls**: parent awaits then renders child that awaits. Fix by hoisting fetches to a common parent in parallel, or wrap each slow child in its own `<Suspense fallback>` so the shell streams immediately.
**Next.js route handlers/actions**: kick off all promises first, then await.
Detect: network tab shows stair-stepped requests; `await` followed by another independent `await`.

## 2. Bundle size (critical)
- Barrel imports (`import { Button } from '@/components'`, `import { x } from 'lodash'`, icon libs) pull whole trees. Import from the file, or `experimental.optimizePackageImports: ['lucide-react']`.
- `const Chart = dynamic(() => import('./Chart'), { ssr: false, loading: () => <Skeleton/> })` for heavy client-only widgets.
- Conditional feature modules: `if (flag) { const m = await import('./feature') }`.
- Third-party scripts: `next/script strategy="lazyOnload"` or load after hydration.
- Preload on intent: `onMouseEnter={() => import('./Modal')}`.
- Replace heavy deps (moment -> date-fns/dayjs/Intl). Keep server-only code out of client bundles (`import 'server-only'`).
- Measure: `ANALYZE=true next build`; budget the first-load JS per route.

## 3. Server side (high)
- `React.cache(fn)` dedupes identical calls within one request (layouts + pages + metadata can call the same loader).
- Cross-request cache: `unstable_cache`/`fetch(..., { next: { revalidate, tags } })`, `revalidateTag` after mutations; or a small LRU for expensive pure lookups.
- Serialization boundary: props to client components are serialized into the HTML payload. Pass `{id,name}`, not whole objects.
- Non-blocking post-response work (logging, analytics): `after(() => ...)`.
- Don't `fetch` your own API route from a server component: call the function directly.

## 4. Client fetching
- One shared cache (TanStack Query/SWR) dedupes identical keys; set `staleTime` deliberately (default 0 refetches on every mount/focus).
- Query key includes every variable the fetcher uses. Pass `signal` to `fetch` so unmounted requests abort.
- Prefetch on hover/route intent; `keepPreviousData` for pagination to avoid flashing.
- Dedupe global listeners (one `resize`/`scroll` subscription, not one per component); passive listeners for scroll.

## 5. Re-renders (medium)
- Measure with React DevTools Profiler first ("why did this render").
- Derive during render; don't mirror props into state.
- Effects: depend on primitives, not fresh object/array literals.
- Expensive subtree behind `memo` + stable props (`useCallback`/`useMemo` only to keep memo effective). With React Compiler enabled, drop manual memoization.
- Move state down or lift content up (`children` prop) so state changes don't re-render large static trees.
- Transient values (mouse position, scroll) in refs or CSS variables, not state.
- Context: split by update frequency; context value memoized; large lists should not read frequently changing context.
- `startTransition`/`useDeferredValue` for filtering big lists while typing.

## 6. Rendering
- `content-visibility: auto; contain-intrinsic-size: 0 500px` on long off-screen sections; virtualize lists > ~200 rows (`@tanstack/react-virtual`).
- Hoist static JSX/objects/regex out of components. Animate a wrapper `div`, not an `<svg>` element.
- Hydration mismatch (`Date.now`, `localStorage`, `window` in render): read in effect or use `suppressHydrationWarning` only for known-diff text; avoid theme flicker with an inline script setting the class before paint.
- `<Activity>`/CSS `hidden` to preserve state of tabs instead of unmount/remount when cheap.
- Core Web Vitals targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. Reserve space (width/height, aspect-ratio) for images, embeds, async content; `priority` the LCP image; `font-display: swap` with `next/font`.

## 7. JS micro (only on hot paths)
`Map`/`Set` for repeated lookups; build an index map instead of `find` in loops; combine chained `filter().map()` in big arrays; early returns; `toSorted()` instead of mutating `sort()`; hoist `new RegExp`; cache `localStorage` reads.

## Checklist
- [ ] no sequential independent awaits  - [ ] no barrel imports; heavy parts lazy
- [ ] client boundary at the leaf, minimal props  - [ ] Suspense around slow data
- [ ] images sized, LCP prioritized  - [ ] no derived state in effects
