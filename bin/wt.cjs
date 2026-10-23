#!/usr/bin/env node
'use strict';
// Shipwright worktrees: isolated checkout + cloned deps + env subset + own Postgres DB + own Redis db + free port.
//
//   wt.cjs create <slug> [--prefix feat] [--base <branch>] [--size small|large] [--no-db] [--no-deps]
//   wt.cjs remove <slug|path> [--force]
//   wt.cjs list | info | port
//
// Output: JSON on stdout. Errors: {"error": "..."} and exit 1.
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');
const cfg = require('./lib/config.cjs');
const { git, tryGit, mainRoot, baseBranch } = require('./lib/git.cjs');
const pg = require('./lib/pg.cjs');
const envfile = require('./lib/envfile.cjs');
const state = require('./lib/state.cjs');

const PREFIXES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore'];
const DB_URL_KEYS = ['DATABASE_URL', 'POSTGRES_URL', 'DB_URL', 'PG_URL'];
const REDIS_ALLOC = path.join(cfg.HOME, 'redis-allocations.json');

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function fail(msg, extra = {}) {
  out({ error: msg, ...extra });
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) args._.push(a);
    else if (a.startsWith('--no-')) args[a.slice(5)] = false;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[a.slice(2)] = argv[++i];
    else args[a.slice(2)] = true;
  }
  return args;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

function requireRoot() {
  const root = mainRoot(process.cwd());
  if (!root) fail('Not inside a git repository.');
  return root;
}

function ensureIgnored(root, dirName) {
  const gi = path.join(root, '.gitignore');
  const text = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const entry = `${dirName}/`;
  if (!text.split('\n').some((l) => l.trim() === entry || l.trim() === `/${entry}` || l.trim() === dirName)) {
    fs.writeFileSync(gi, text + (text && !text.endsWith('\n') ? '\n' : '') + `${entry}\n`);
  }
  // Local-only artifacts go to .git/info/exclude so they never show up as diffs.
  const exclude = path.join(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], root), 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  const ex = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  const add = [state.FILE, '.sw/'].filter((e) => !ex.split('\n').includes(e));
  if (add.length) fs.appendFileSync(exclude, (ex && !ex.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n');
}

// Directories (depth ≤ 3) holding a given entry, skipping heavy/generated trees.
function findDirsWith(root, predicate, depth = 3) {
  const skip = new Set(['node_modules', '.git', cfg.load().worktreeDir, 'dist', 'build', '.next', 'vendor', 'coverage']);
  const found = [];
  (function walk(dir, d) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (predicate(dir, entries)) found.push(dir);
    if (d === 0) return;
    for (const e of entries) if (e.isDirectory() && !skip.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), d - 1);
  })(root, depth);
  return found;
}

// node_modules: APFS clone (instant, copy-on-write, isolated). Fallback: symlink.
function cloneDeps(root, wtPath) {
  const dirs = findDirsWith(root, (dir, entries) => entries.some((e) => e.name === 'node_modules' && e.isDirectory()));
  const results = [];
  for (const dir of dirs) {
    const rel = path.relative(root, dir);
    const src = path.join(dir, 'node_modules');
    const dst = path.join(wtPath, rel, 'node_modules');
    if (!fs.existsSync(path.dirname(dst))) continue;
    try {
      execFileSync('cp', ['-cR', src, dst], { stdio: 'ignore' });
      results.push({ dir: rel || '.', mode: 'apfs-clone' });
    } catch {
      try {
        execFileSync('cp', ['-R', '--reflink=auto', src, dst], { stdio: 'ignore' });
        results.push({ dir: rel || '.', mode: 'reflink-copy' });
      } catch {
        fs.symlinkSync(src, dst, 'dir');
        results.push({ dir: rel || '.', mode: 'symlink', warning: 'shared with main checkout — run a real install before changing deps or the Prisma schema' });
      }
    }
  }
  return results;
}

function copyEnv(root, wtPath) {
  const dirs = findDirsWith(root, (dir, entries) => entries.some((e) => e.isFile() && envfile.WANTED.test(e.name)));
  const files = [];
  for (const dir of dirs) {
    const rel = path.relative(root, dir);
    if (!fs.existsSync(path.join(wtPath, rel))) continue;
    for (const name of fs.readdirSync(dir).filter((n) => envfile.WANTED.test(n))) {
      const dst = path.join(wtPath, rel, name);
      fs.copyFileSync(path.join(dir, name), dst);
      files.push(dst);
    }
  }
  return files;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function pgPassword(url, conf) {
  return new URL(url).password ? '' : conf.postgres.password;
}

function dbName(srcDb, slug) {
  return `${srcDb}_wt_${slug.replace(/-/g, '_')}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 63);
}

function setupDb(envFiles, slug, conf) {
  let srcUrl = null;
  for (const f of envFiles) {
    const vars = envfile.read(f);
    const key = DB_URL_KEYS.find((k) => pg.isPgUrl(vars[k]));
    if (key) {
      srcUrl = vars[key];
      break;
    }
  }
  if (!srcUrl) return { skipped: 'no Postgres URL in env files' };

  const password = pgPassword(srcUrl, conf);
  const { db: srcDb } = pg.parse(srcUrl);
  const name = dbName(srcDb, slug);
  const size = pg.dbSize(srcUrl, password);
  const schemaOnly = size > conf.dbCloneMaxBytes;
  if (pg.exists(srcUrl, name, password)) pg.drop(srcUrl, name, password);
  pg.create(srcUrl, name, password);
  const cloned = pg.clone(srcUrl, name, { password, schemaOnly });

  // Point every Postgres URL on the same server+db at the new database.
  for (const f of envFiles) {
    const vars = envfile.read(f);
    const patch = {};
    for (const [k, v] of Object.entries(vars)) {
      if (pg.isPgUrl(v) && pg.sameServer(v, srcUrl) && pg.parse(v).db === srcDb) patch[k] = pg.withDb(v, name);
    }
    if (Object.keys(patch).length) envfile.rewrite(f, patch);
  }
  return { name, source: srcDb, sourceBytes: size, mode: cloned.mode, needsSeed: schemaOnly, url: pg.libpqUrl(pg.withDb(srcUrl, name)).replace(/\/\/([^:@/]+):[^@]+@/, '//$1:***@') };
}

function readAlloc() {
  try {
    return JSON.parse(fs.readFileSync(REDIS_ALLOC, 'utf8'));
  } catch {
    return {};
  }
}

function writeAlloc(a) {
  fs.mkdirSync(cfg.HOME, { recursive: true });
  fs.writeFileSync(REDIS_ALLOC, JSON.stringify(a, null, 2) + '\n');
}

function redisCli(host, port, password, args) {
  const base = ['-h', host, '-p', String(port)];
  if (password) base.push('-a', password, '--no-auth-warning');
  return execFileSync('redis-cli', [...base, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function setupRedis(envFiles, wtPath, conf) {
  let target = null;
  for (const f of envFiles) {
    const v = envfile.read(f);
    if (v.REDIS_URL) {
      const u = new URL(v.REDIS_URL);
      target = { host: u.hostname, port: Number(u.port || 6379), password: decodeURIComponent(u.password || '') };
      break;
    }
    if (v.REDIS_HOST) {
      target = { host: v.REDIS_HOST, port: Number(v.REDIS_PORT || 6379), password: v.REDIS_PASSWORD || '' };
      break;
    }
  }
  if (!target) return { skipped: 'no REDIS_URL / REDIS_HOST in env files' };

  const key = `${target.host}:${target.port}`;
  const alloc = readAlloc();
  const used = alloc[key] || {};
  let index = null;
  for (let i = 1; i <= 15; i++) {
    if (used[i]) continue;
    try {
      if (redisCli(target.host, target.port, target.password, ['-n', String(i), 'dbsize']) === '0') {
        index = i;
        break;
      }
    } catch {
      return { skipped: `redis ${key} unreachable` };
    }
  }
  if (!index) return { skipped: `no empty redis db index on ${key}` };
  alloc[key] = { ...used, [index]: wtPath };
  writeAlloc(alloc);

  for (const f of envFiles) {
    const v = envfile.read(f);
    const patch = {};
    if (v.REDIS_URL) {
      const u = new URL(v.REDIS_URL);
      u.pathname = `/${index}`;
      patch.REDIS_URL = u.toString();
    }
    if (v.REDIS_HOST || 'REDIS_DB' in v) patch.REDIS_DB = String(index);
    if (Object.keys(patch).length) envfile.rewrite(f, patch);
  }
  return { host: key, db: index, password: target.password ? '***' : '' };
}

async function cmdCreate(args) {
  const root = requireRoot();
  const conf = cfg.load();
  const slug = slugify(args._[1] || '');
  if (!slug) fail('Usage: wt.cjs create <slug> [--prefix feat] [--base <branch>]');
  const prefix = PREFIXES.includes(args.prefix) ? args.prefix : 'feat';
  const branch = `${prefix}/${slug}`;
  const base = args.base || baseBranch(root, conf.defaultBase);
  if (base === 'develop') fail('Refusing to branch from develop — use the release-track branch (master or the root worktree branch).');

  const wtPath = path.join(root, conf.worktreeDir, `${prefix}-${slug}`);
  if (fs.existsSync(wtPath)) fail(`Worktree already exists: ${wtPath}`);
  ensureIgnored(root, conf.worktreeDir);

  const branchExists = !!tryGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root);
  git(branchExists ? ['worktree', 'add', wtPath, branch] : ['worktree', 'add', '-b', branch, wtPath, base], root);

  const result = { path: wtPath, branch, base, slug };
  result.deps = args.deps === false ? 'skipped' : cloneDeps(root, wtPath);
  const envFiles = copyEnv(root, wtPath);
  result.env = envFiles.map((f) => path.relative(wtPath, f));

  result.port = await freePort();
  for (const f of envFiles.filter((f) => /\.env(\.local|\.development(\.local)?|\.dev)?$/.test(f))) envfile.rewrite(f, { PORT: String(result.port) });

  if (args.db === false) result.db = { skipped: '--no-db' };
  else {
    try {
      result.db = setupDb(envFiles, slug, conf);
    } catch (e) {
      result.db = { error: String(e.stderr || e.message).split('\n')[0] };
    }
  }
  try {
    result.redis = setupRedis(envFiles, wtPath, conf);
  } catch (e) {
    result.redis = { error: e.message };
  }

  state.write(wtPath, {
    slug, branch, base, size: args.size || null, stage: 'worktree', round: 0,
    mainRoot: root, port: result.port,
    db: result.db && result.db.name ? { name: result.db.name, mode: result.db.mode, needsSeed: result.db.needsSeed } : null,
    redis: result.redis && result.redis.db ? { host: result.redis.host, db: result.redis.db } : null,
  });
  out(result);
}

function resolveWorktree(root, target) {
  const conf = cfg.load();
  if (target && fs.existsSync(target)) return path.resolve(target);
  const dir = path.join(root, conf.worktreeDir);
  const hit = fs.existsSync(dir) && fs.readdirSync(dir).find((n) => n === target || n.endsWith(`-${slugify(target)}`));
  return hit ? path.join(dir, hit) : null;
}

function cmdRemove(args) {
  const root = requireRoot();
  const conf = cfg.load();
  const wtPath = resolveWorktree(root, args._[1] || '');
  if (!wtPath) fail(`Worktree not found: ${args._[1]}`);
  const s = state.read(wtPath) || {};
  // Untracked-but-not-ignored files may be real, uncommitted work: never delete them silently.
  const dirty = tryGit(['status', '--porcelain'], wtPath);
  if (dirty && !args.force) fail('Worktree has uncommitted or untracked files. Commit them or pass --force.', { dirty: dirty.split('\n') });

  const result = { path: wtPath, branch: s.branch };
  if (s.db && s.db.name) {
    try {
      const envs = fs.readdirSync(wtPath).filter((n) => envfile.WANTED.test(n)).map((n) => envfile.read(path.join(wtPath, n)));
      const url = envs.map((v) => DB_URL_KEYS.map((k) => v[k]).find(pg.isPgUrl)).find(Boolean);
      if (url) {
        pg.drop(url, s.db.name, pgPassword(url, conf));
        result.db = { dropped: s.db.name };
      } else result.db = { error: 'no DATABASE_URL left in worktree env; drop manually', name: s.db.name };
    } catch (e) {
      result.db = { error: String(e.stderr || e.message).split('\n')[0], name: s.db.name };
    }
  }
  if (s.redis && s.redis.db) {
    const [host, port] = s.redis.host.split(':');
    try {
      redisCli(host, port, conf.redis.password, ['-n', String(s.redis.db), 'flushdb']);
      result.redis = { flushed: s.redis.db };
    } catch (e) {
      result.redis = { error: e.message };
    }
    const alloc = readAlloc();
    if (alloc[s.redis.host]) delete alloc[s.redis.host][s.redis.db];
    writeAlloc(alloc);
  }
  git(['worktree', 'remove', ...(args.force ? ['--force'] : []), wtPath], root);
  if (s.branch && args.branch !== false) {
    const del = tryGit(['branch', args.force ? '-D' : '-d', s.branch], root);
    result.branchDeleted = del !== null;
    if (del === null) result.branchNote = 'branch kept (not merged); pass --force to delete';
  }
  out(result);
}

function cmdList() {
  const root = requireRoot();
  const dir = path.join(root, cfg.load().worktreeDir);
  const items = fs.existsSync(dir)
    ? fs.readdirSync(dir).map((n) => ({ name: n, path: path.join(dir, n), state: state.read(path.join(dir, n)) }))
    : [];
  out({ root, worktrees: items });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args._[0]) {
    case 'create':
      return cmdCreate(args);
    case 'remove':
      return cmdRemove(args);
    case 'list':
      return cmdList();
    case 'info': {
      const root = requireRoot();
      return out({ root, base: baseBranch(root, cfg.load().defaultBase), worktreeDir: path.join(root, cfg.load().worktreeDir) });
    }
    case 'port':
      return out({ port: await freePort() });
    default:
      fail('Usage: wt.cjs create|remove|list|info|port');
  }
}

if (require.main === module) {
  main().catch((e) => fail(e.message));
}

module.exports = { slugify, dbName, parseArgs };
