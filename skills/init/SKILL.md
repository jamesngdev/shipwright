---
name: init
description: First-run setup of a repo for Shipwright — detects the stack and asks for dev/prod domains and dev test auth, then writes the git-ignored CLAUDE.local.md. Use when a repo has no CLAUDE.local.md.
---

# Init (per repo)

## 1. Detect (no questions yet)
- Stack: `package.json` (NestJS? Next/React/Vite? package manager from lockfile), `go.mod`, `prisma/schema.prisma`, docker-compose services.
- Commands from `package.json` scripts / Makefile / Taskfile: lint, typecheck, unit test, integration/e2e test, coverage, build, dev server, migrate, seed.
- Health endpoint (grep `health`, `/healthz`, `TerminusModule`), API prefix/versioning, auth mechanism (guards/middleware) — names and file paths only.
- `llms.txt` present? Base branch (`git worktree list`, `origin/HEAD`).
- Env variable names only: `grep -o '^[A-Za-z_][A-Za-z0-9_]*=' .env*` — never print values.

## 2. Ask (one AskUserQuestion call)
- Dev domain (base URL of the dev environment API / web).
- Prod domain.
- Dev test auth for smoke tests on dev: a test account (login endpoint + credentials) or a long-lived dev token. "Skip" is allowed — `/sw:verify-dev` will then test only public endpoints.
- Anything detected with low confidence (e.g. which script is the integration test).

## 3. Write `CLAUDE.local.md` at the repo root
```markdown
# Local project context (Shipwright) — not committed

## Environments
- Dev: <url>   · health: <path>
- Prod: <url>  · (read-only — never test against prod)

## Dev smoke-test auth
<how to get a token on dev: endpoint + credentials, or token>

## Commands
- install: … · lint: … · typecheck: … · unit: … · integration: … · coverage: … · build: … · dev: … · migrate: … · seed: …

## Stack notes
- <framework, ORM, API prefix/versioning, auth guard location, llms.txt yes/no>
```
Then make sure `.gitignore` contains `CLAUDE.local.md` and `.worktree/` (append if missing).

## 4. Report
Print the file (mask secrets) and what was inferred vs. answered.
