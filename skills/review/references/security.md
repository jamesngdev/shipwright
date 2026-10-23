# Security review lens

Scope: the branch diff only; read surrounding code to confirm reachability. Report an attack in 1-2 sentences, with file:line. No style findings.
Severity: **B** = blocker (exploitable or committed secret), **W** = warning (risky, needs a human decision or reachability unclear), **I** = hardening.
Detect = quick grep/smell to find candidates; confirm before reporting.

## Ordered checklist
1. **Committed secrets (B).** Keys, tokens, passwords, private URLs, `.env` content in code/fixtures/Docker layers.
   Detect: `grep -rnE "(api[_-]?key|secret|token|passw(or)?d|BEGIN (RSA|PRIVATE))\s*[:=]" <changed files>`; `git diff` containing `.env*`, `*.pem`, `AKIA[0-9A-Z]{16}`.
2. **Injection (B).** SQL/NoSQL/command/template built from input.
   Detect: Node `$queryRawUnsafe|\.query\(\`|exec\(|execSync|spawn\(.*shell|eval\(|new Function`; Go `fmt.Sprintf\(".*(SELECT|INSERT|UPDATE|DELETE)`, `exec.Command("sh", "-c"`; Mongo `where`/operators from `req.body` (`$ne`).
3. **Broken authentication (B).** Missing guard on a new route; JWT `alg: none`/verify disabled/`ignoreExpiration`; weak/default secrets; tokens in URLs/localStorage.
   Detect: new controller/route lacking the guard/middleware its siblings use (`@Public()` added casually, `r.Get` registered outside the auth group); `jwt.decode` used instead of `verify`.
4. **Broken authorization / IDOR (B).** Object fetched or mutated by id without ownership/tenant check; client-supplied `userId`/`role`; mass assignment.
   Detect: `findUnique({ where: { id } })` / `GetByID(ctx, id)` fed straight from params with no `userId`/`orgId` in the query; DTO accepts `role`, `isAdmin`, `ownerId`; `Object.assign(entity, body)`.
5. **SSRF (B/W).** Server fetches a URL derived from input (webhooks, image/URL import, redirect follow).
   Detect: `axios|fetch|http.Get` with a variable URL; no allowlist/private-IP (127.0.0.1, 169.254.169.254, 10/8) block; redirects followed.
6. **Sensitive data exposure (B/W).** Raw DB rows returned (password hashes, refresh tokens); PII/tokens in logs, errors, analytics; verbose errors/stack traces to clients.
   Detect: `return user` / `res.json(row)` without DTO; `console.log|logger.*\(.*(token|password|authorization|body)`; `NEXT_PUBLIC_` holding a secret; `error.stack` in a response.
7. **Path traversal / file handling (B/W).** Request data joined into fs paths; uploads without type, size, name sanitization; serving user files from the app origin.
   Detect: `path.join\(.*req\.|filepath.Join\(.*r\.`, no check that the result stays under the base dir (`path.resolve` + `startsWith`; Go `filepath.Rel`); `multer` without `limits`; trusting `file.mimetype`.
8. **Unsafe deserialization / prototype pollution (W).**
   Detect: `lodash.merge|set|defaultsDeep` or `Object.assign` with user keys; `__proto__`; `yaml.load` unsafe; `pickle`; Go `gob` from network.
9. **XSS / client-side (B/W).** Unescaped HTML from input; open redirects; unsafe `target=_blank`.
   Detect: `dangerouslySetInnerHTML`, `innerHTML =`, `v-html`, `href={userInput}` (`javascript:` URLs), `window.location = param` without allowlist, `rel` missing `noopener` on external links.
10. **CSRF / CORS / cookies (W).** Cookie auth with state-changing GET or no CSRF defense; wildcard origin with credentials; cookies without `HttpOnly; Secure; SameSite`.
    Detect: `origin: true|'*'` with `credentials: true`; `cookie(` without flags; mutating `@Get`.
11. **Weak crypto & randomness (W).** MD5/SHA1 for passwords, unsalted hashes, hard-coded IV/salt, `Math.random`/`math/rand` for tokens, non-constant-time secret comparison, TLS verify off.
    Detect: `createHash\('(md5|sha1)'`, `Math.random\(\)`, `math/rand` imported in auth code, `rejectUnauthorized: false`, `InsecureSkipVerify: true`, `===` on signatures/tokens.
12. **Missing rate limiting / abuse controls (W).** Login, OTP, password reset, expensive/export endpoints, unbounded upload or body size.
    Detect: new auth/OTP route with no throttle decorator/middleware; no body-size limit (`http.MaxBytesReader`, Nest `bodyParser` limit).
13. **Webhooks & integrations (B/W).** Inbound webhook without signature verification or replay protection; secrets compared with `==`.
    Detect: `/webhook` handler not calling a verify function before parsing body; no event-id dedupe.
14. **Dependencies & supply chain (W/I).** New packages: typosquats, unmaintained, install scripts; unpinned/`latest`; lockfile not updated.
    Detect: `git diff package.json go.mod` ; `npm audit --omit=dev`, `govulncheck ./...`.
15. **Container/infra (W).** Root user, secrets in `ENV`/`ARG`, `COPY .env`, debug ports, public DB/Redis ports.
    Detect: Dockerfile lacks `USER`; `ENV .*(KEY|SECRET|PASSWORD)`; compose `ports: ["5432:5432"]` in prod config.
16. **Dev-only bypass left in (B).** Auth/validation bypass, test accounts, debug routes, TODO-disabled checks.
    Detect: `grep -rn "@sw-auth-bypass\|BYPASS\|skipAuth\|DISABLE_AUTH\|if (process.env.NODE_ENV !== 'production')" <diff>`.

## Language specifics
- **Node/Nest:** `ValidationPipe` missing `whitelist`; `@Body() body: any`; `@Public()` additions; Prisma `P2002` message echoed to client (enumeration); `helmet`/CORS config changes; `child_process` + request data; regex from input (ReDoS: nested quantifiers).
- **Prisma:** `$queryRawUnsafe`, `$executeRawUnsafe`; `where` built from `req.query` object directly (filter injection, e.g. `{ password: { startsWith } }`); `select` omitted -> returns hashed password; tenant filter missing on a new query.
- **Go:** `text/template` for HTML (use `html/template`); `http.ListenAndServe` without timeouts (slowloris); `os/exec` with user args; ignoring errors on auth/crypto calls; `ioutil.ReadAll(r.Body)` unbounded; `gosec ./...` for a quick sweep.
- **Frontend:** secrets in client bundle, tokens in `localStorage`, unvalidated `redirect` params, `postMessage` without origin check, CSP weakened, server actions without auth.

## Confirm before reporting
Is the input attacker-controlled? Is it reachable without auth? What does the attacker gain? If you cannot answer, downgrade to W and say what is unverified.
