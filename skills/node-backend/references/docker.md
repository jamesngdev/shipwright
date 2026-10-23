# Docker (Node services)

## Reference Dockerfile
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
```
Use `yarn --frozen-lockfile` / `pnpm i --frozen-lockfile` to match the repo's lockfile.

## Rules -> why
- Pin a specific tag (digest for strict reproducibility), same tag locally and in prod: `latest` makes builds non-reproducible.
- Multi-stage: compilers/dev deps stay out of runtime (size + attack surface).
- Manifests + install before `COPY . .`: deps layer stays cached until the lockfile changes.
- `.dockerignore`: `node_modules .git .env* dist coverage *.log .DS_Store .worktree`. Without it, `COPY . .` leaks `.env` and busts the cache.
- Non-root `USER`; no secrets in `ENV`/`ARG`/layers (`docker history` shows them). Build-time secret: `RUN --mount=type=secret,id=npmrc ...`.
- Run compiled JS, not `ts-node`. PID 1 must handle signals: `CMD ["node", ...]` (exec form, not shell form) and `app.enableShutdownHooks()`.
- Alpine + native modules (bcrypt, sharp) can break on musl: use `-slim` (Debian) or install build tools in the build stage only.
- Prisma needs `prisma generate` for the runtime platform; add `binaryTargets` if build and runtime OS differ; run `prisma migrate deploy` as a separate release step/job, not inside every replica's startup.

## Compose (local dev)
```yaml
services:
  db:    { image: postgres:16-alpine, environment: { POSTGRES_PASSWORD: dev }, ports: ["5432:5432"],
           healthcheck: { test: ["CMD-SHELL","pg_isready -U postgres"], interval: 5s, retries: 10 } }
  redis: { image: redis:7-alpine, ports: ["6379:6379"] }
  api:   { build: ., env_file: .env, depends_on: { db: { condition: service_healthy } } }
```
- Healthchecks + `condition: service_healthy` instead of sleep loops. Named volumes for data. Never expose db/redis ports publicly in prod compose.

## Runtime
- Validate env at boot; fail fast. `/health` (liveness, no deps) vs `/ready` (checks DB/Redis).
- Memory limit + `--max-old-space-size` ~75% of it, else the OOM-killer terminates with no stack.
- Structured logs to stdout; never write logs to the container filesystem.

## Frontend images
Static SPA: build stage -> `nginx:alpine` with `try_files $uri /index.html;`, long cache for hashed assets, `no-cache` on `index.html`. Next.js: `output: 'standalone'`, copy `.next/standalone` + `.next/static` + `public`.

## Verify
```bash
docker build -t app:test . && docker run --rm -p 3000:3000 --env-file .env app:test
docker image ls app:test           # sanity-check size
docker run --rm app:test id        # confirms non-root (uid != 0)
```
