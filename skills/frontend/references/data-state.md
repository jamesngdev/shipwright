# Data fetching, mutations, forms, state

## Where state goes
| State | Home |
|---|---|
| server data | TanStack Query / SWR / server component |
| shareable view state (filters, tab, page, sort) | URL search params |
| form fields | react-hook-form (or uncontrolled `<form>` + FormData) |
| local UI (open/closed, hover) | `useState` in the nearest component |
| cross-tree client state (cart, theme) | small store (Zustand) or context for rarely-changing values |
Never duplicate server data into client state; derive from the cache.

## Query pattern
```tsx
export const orderKeys = { all: ['orders'] as const, list: (f: Filters) => [...orderKeys.all, 'list', f] as const,
  detail: (id: string) => [...orderKeys.all, id] as const };

const { data, isPending, error } = useQuery({
  queryKey: orderKeys.list(filters),
  queryFn: ({ signal }) => api.get<Order[]>('/orders', { params: filters, signal }),
  staleTime: 30_000,
});
if (isPending) return <Skeleton />;
if (error) return <ErrorState error={error} retry={refetch} />;
if (!data.length) return <EmptyState />;
```
- Typed API client wrapper owns base URL, auth header, error normalization (maps the backend error body `{error:{code,message}}` to a typed `ApiError`), and `credentials`.
- Validate untrusted responses with zod at the client boundary when the backend contract is loose.

## Mutations
```tsx
const m = useMutation({
  mutationFn: api.cancelOrder,
  onMutate: async (id) => {                       // optimistic
    await qc.cancelQueries({ queryKey: orderKeys.all });
    const prev = qc.getQueryData(orderKeys.detail(id));
    qc.setQueryData(orderKeys.detail(id), (o) => o && { ...o, status: 'CANCELLED' });
    return { prev };
  },
  onError: (_e, id, ctx) => qc.setQueryData(orderKeys.detail(id), ctx?.prev),   // rollback
  onSettled: () => qc.invalidateQueries({ queryKey: orderKeys.all }),
});
```
- Disable the submit control while pending (double-submit). Send an `Idempotency-Key` for non-repeatable creates.
- Toast/inline message on both success and failure; map backend `code` to user text.

## Forms
```tsx
const schema = z.object({ email: z.string().email(), age: z.coerce.number().int().min(18) });
const { register, handleSubmit, formState: { errors, isSubmitting } } =
  useForm({ resolver: zodResolver(schema) });
<form onSubmit={handleSubmit(onValid)} noValidate>
  <label htmlFor="email">Email</label>
  <input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email}
         aria-describedby={errors.email ? 'email-err' : undefined} {...register('email')} />
  {errors.email && <p id="email-err" role="alert">{errors.email.message}</p>}
```
- Share the zod schema with the backend contract where possible; the server stays the authority.
- Server-side field errors (400 `details`) -> `setError(field, ...)`.
- Correct `type`, `inputmode`, `autocomplete`; never block paste; submit stays enabled until a request starts, then shows progress; warn on unsaved changes.
- Next.js server actions: validate with zod inside the action, check auth/ownership inside it (actions are public endpoints), return typed result `{ok, errors}`, `revalidatePath/Tag` after writes.

## URL state
`useSearchParams` + `router.replace(url, { scroll: false })`; debounce text input (300ms); defaults omitted from the URL; parse/validate params (never trust).

## Auth on the client
- Tokens in httpOnly, Secure, SameSite cookies; avoid `localStorage` for tokens (XSS-readable).
- Route protection is UX only; the API enforces authorization.
- Never put secrets in `NEXT_PUBLIC_*` env vars (inlined into the bundle).

## Error boundaries
Route-level `error.tsx`/`ErrorBoundary` with reset; `not-found.tsx`; log to the monitoring tool, show a recoverable message.

## Checklist
- [ ] query keys include all inputs; abort signal passed
- [ ] loading + empty + error states rendered
- [ ] mutation invalidates/rolls back; double-submit prevented
- [ ] form labelled, validated client + server, errors announced
