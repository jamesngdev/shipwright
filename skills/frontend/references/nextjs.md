# Next.js (App Router) essentials

## Server vs client
- Default server components: can `await` data, access DB/secrets, ship zero JS. Add `"use client"` only for state, effects, browser APIs, event handlers; push it to the smallest leaf.
- Client components can render server components passed as `children`. Don't import a server component into a client file.
- `import 'server-only'` in modules that touch secrets/DB.

## Caching model (version-sensitive: confirm against the repo's Next version via context7)
- Know the defaults of the installed version: `fetch` caching and route caching changed between 14 and 15+. Be explicit: `fetch(url, { cache: 'no-store' })` for per-request data, `{ next: { revalidate: 60, tags: ['orders'] } }` for time/tag-based.
- Mutations: server action or route handler then `revalidateTag('orders')` / `revalidatePath('/orders')`.
- Per-user data must never land in a shared cache: reading `cookies()`/`headers()` makes the route dynamic; don't cache authenticated responses publicly.
- `generateStaticParams` for known dynamic routes; `dynamic = 'force-dynamic'` only when needed.

## Routing files
`layout.tsx` (persistent shell; doesn't re-render on navigation), `page.tsx`, `loading.tsx` (instant Suspense fallback), `error.tsx` (client, with reset), `not-found.tsx`, `route.ts` (handlers), `middleware.ts` (edge: auth redirects/rewrites only; no heavy work, no DB drivers).
- Route groups `(marketing)`, parallel/intercepting routes for modals; `params`/`searchParams` are async in newer versions: `await props.params`.

## Server actions
```ts
'use server'
export async function cancelOrder(id: string) {
  const user = await requireUser();                       // actions are public HTTP endpoints
  const parsed = z.string().uuid().safeParse(id); if (!parsed.success) return { ok: false };
  await orders.cancel(parsed.data, user.id);              // ownership enforced here
  revalidateTag('orders'); return { ok: true };
}
```
Use `useActionState`/`useFormStatus` for pending/errors; progressive enhancement works without JS.

## Metadata & SEO
`export const metadata` / `generateMetadata` (dedupe its fetches with `React.cache`); canonical, OpenGraph, `robots`, `sitemap.ts`; one `<h1>`; semantic HTML; `next/image` + `alt`.

## Config pitfalls
- `NEXT_PUBLIC_*` is public and inlined at build time.
- `images.remotePatterns` restrict hosts (prevents open image proxy).
- Security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) via `headers()` in `next.config`.
- Docker: `output: 'standalone'`; env needed at runtime vs build time is different for `NEXT_PUBLIC_`.
- Edge runtime lacks Node APIs: choose `runtime = 'nodejs'` for Prisma/pg.

## Commands
```bash
next build            # type + lint + route table: look at "First Load JS" and static/dynamic markers
next build --debug    # more details; ANALYZE=true next build (with @next/bundle-analyzer)
next lint && tsc --noEmit
```
Route table sanity: pages that should be static are `○`/`●`, not `ƒ` (accidentally dynamic from `cookies()`/`searchParams`).

## Checklist
- [ ] client boundary minimal; no secrets in client code
- [ ] caching explicit, per-user data never shared-cached
- [ ] actions authenticate + validate + revalidate
- [ ] loading/error/not-found present for new routes
