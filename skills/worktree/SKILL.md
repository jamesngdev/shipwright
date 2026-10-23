---
name: worktree
description: Creates a task's isolated workspace — git worktree in .worktree/, cloned node_modules, needed .env files, own Postgres DB and Redis db, free port.
---

# Worktree

`SW=~/.claude/shipwright/bin`

## 1. Create
```bash
cd <main checkout> && node $SW/wt.cjs create <slug> --prefix <feat|fix|refactor|perf|chore> --size <small|large>
```
The script (JSON output):
- branches from the root worktree's branch, else `master`/`main` — never `develop` (`--base <b>` only if the user named one);
- creates `.worktree/<prefix>-<slug>` and adds `.worktree/` to `.gitignore`;
- APFS-clones every `node_modules` (copy-on-write: the main checkout's Prisma client stays safe); falls back to reflink copy, then symlink (warns);
- copies only `.env`, `.env.local`, `.env.development*`, `.env.test*` — never production/staging;
- clones the DB from the env's `DATABASE_URL` into `<db>_wt_<slug>` on the same server: full `pg_dump | psql` when ≤ 100MB, otherwise schema + migration history only (`needsSeed: true`);
- allocates an empty Redis db index, sets a free `PORT`, rewrites the worktree's env files;
- writes `.sw-state.json` (statusline / resume).

## 2. Read the result and act
- `db.needsSeed` → run the repo's seed command (from `CLAUDE.local.md`) inside the worktree.
- `db.error` / `redis.error` → fix the cause (wrong password? server down? → `/sw:setup`), then `node $SW/wt.cjs remove <slug> --force` and recreate. Do not continue on the main DB.
- `deps[].mode == "symlink"` → run a real install inside the worktree before changing dependencies or the Prisma schema.
- Prisma repo: run `npx prisma generate` in the worktree if the schema will change.
- Go repo: nothing to install (module cache is shared).

## 3. Move the specs in
```bash
mkdir -p <wt>/docs/specs/<YYMMDD>-<slug> && mv <main>/.sw/specs/<slug>/* <wt>/docs/specs/<YYMMDD>-<slug>/ && node $SW/state.cjs clear   # (in main)
```
First commit in the worktree: `docs(spec): <slug> design and plan`.

## 4. Work there
From now on use absolute paths under `<wt>` for every file tool, and prefix shell commands with `cd <wt> &&`. Update state there: `cd <wt> && node $SW/state.cjs set stage=build`.

Other commands: `wt.cjs list` · `wt.cjs info` · `wt.cjs port` · removal is `/sw:cleanup`.
