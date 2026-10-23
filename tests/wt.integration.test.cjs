'use strict';
// Needs local Postgres + Redis. Configure with SW_TEST_PG (default postgresql://postgres:postgres@localhost:5432)
// and SW_TEST_REDIS (default redis://localhost:6379). Skipped when unreachable.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { runNode, tmpRepo } = require('./helpers.cjs');

const PG = process.env.SW_TEST_PG || 'postgresql://postgres:postgres@localhost:5432';
const REDIS = process.env.SW_TEST_REDIS || 'redis://localhost:6379';
const SRC = 'sw_test_src';
const psql = (db, sql) => execFileSync('psql', [`${PG}/${db}`, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let available = true;
try {
  psql('postgres', 'select 1');
  execFileSync('redis-cli', ['-u', REDIS, 'ping'], { stdio: 'ignore' });
} catch {
  available = false;
}

function setupSource() {
  psql('postgres', `DROP DATABASE IF EXISTS ${SRC} WITH (FORCE)`);
  psql('postgres', `CREATE DATABASE ${SRC}`);
  psql(SRC, `CREATE TABLE users(id serial primary key, email text); INSERT INTO users(email) VALUES ('a@x'),('b@x');
             CREATE TABLE _prisma_migrations(id text primary key, migration_name text); INSERT INTO _prisma_migrations VALUES ('1','init');`);
}

function setupRepo() {
  const dir = tmpRepo();
  fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, '.env'), [
    '# local',
    `DATABASE_URL="${PG}/${SRC}?schema=public"`,
    `REDIS_URL=${REDIS}/0`,
    'PORT=3000',
    'JWT_SECRET=dev',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, '.env.production'), 'DATABASE_URL=postgres://prod\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env*\n!.env.example\nnode_modules/\n');
  execFileSync('git', ['add', '.gitignore'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'ignore'], { cwd: dir });
  return dir;
}

function swHome(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify(extra));
  return home;
}

test('wt create/remove: full clone, env rewrite, redis db, cleanup', { skip: !available && 'local Postgres/Redis unavailable' }, () => {
  setupSource();
  const repo = setupRepo();
  const env = { SW_HOME: swHome() };

  const r = runNode('wt.cjs', { cwd: repo, env, args: ['create', 'Order Refund', '--prefix', 'feat', '--size', 'large'] });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const res = r.json();
  const wt = path.join(repo, '.worktree', 'feat-order-refund');
  assert.equal(res.path, wt);
  assert.equal(res.branch, 'feat/order-refund');
  assert.equal(res.base, 'master');

  // deps cloned (not shared), env subset copied
  assert.equal(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink(), false);
  assert.ok(fs.existsSync(path.join(wt, 'node_modules', 'pkg', 'index.js')));
  assert.deepEqual(res.env, ['.env']);
  assert.ok(!fs.existsSync(path.join(wt, '.env.production')));
  assert.match(fs.readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^\.worktree\/$/m);

  // env rewritten: own DB (query kept), port, redis db
  const wtEnv = fs.readFileSync(path.join(wt, '.env'), 'utf8');
  assert.match(wtEnv, new RegExp(`DATABASE_URL="${PG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sw_test_src_wt_order_refund\\?schema=public"`));
  assert.match(wtEnv, new RegExp(`^PORT=${res.port}$`, 'm'));
  assert.match(wtEnv, new RegExp(`^REDIS_URL=redis://localhost:6379/${res.redis.db}$`, 'm'));
  assert.match(wtEnv, /^JWT_SECRET=dev$/m);
  assert.match(fs.readFileSync(path.join(repo, '.env'), 'utf8'), /sw_test_src\?schema/, 'main checkout untouched');

  // DB fully cloned
  assert.equal(res.db.mode, 'full');
  assert.equal(psql('sw_test_src_wt_order_refund', 'select count(*) from users'), '2');

  // state written for statusline / resume
  const st = JSON.parse(fs.readFileSync(path.join(wt, '.sw-state.json'), 'utf8'));
  assert.equal(st.stage, 'worktree');
  assert.equal(st.db.name, 'sw_test_src_wt_order_refund');

  // remove drops DB and frees the worktree
  const rm = runNode('wt.cjs', { cwd: repo, env, args: ['remove', 'order-refund'] });
  assert.equal(rm.code, 0, rm.stdout + rm.stderr);
  assert.equal(rm.json().db.dropped, 'sw_test_src_wt_order_refund');
  assert.ok(!fs.existsSync(wt));
  assert.equal(psql('postgres', "select count(*) from pg_database where datname = 'sw_test_src_wt_order_refund'"), '0');
});

test('wt create: large source → schema + migration history only', { skip: !available && 'local Postgres/Redis unavailable' }, () => {
  setupSource();
  const repo = setupRepo();
  const env = { SW_HOME: swHome({ dbCloneMaxBytes: 1 }) };
  const r = runNode('wt.cjs', { cwd: repo, env, args: ['create', 'big', '--prefix', 'fix'] });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const res = r.json();
  assert.equal(res.db.mode, 'schema');
  assert.equal(res.db.needsSeed, true);
  assert.equal(psql('sw_test_src_wt_big', 'select count(*) from users'), '0');
  assert.equal(psql('sw_test_src_wt_big', 'select count(*) from _prisma_migrations'), '1');
  runNode('wt.cjs', { cwd: repo, env, args: ['remove', 'big', '--force'] });
  psql('postgres', `DROP DATABASE IF EXISTS ${SRC} WITH (FORCE)`);
});

test('wt create: refuses develop as base', () => {
  const repo = tmpRepo();
  const r = runNode('wt.cjs', { cwd: repo, env: { SW_HOME: swHome() }, args: ['create', 'x', '--base', 'develop'] });
  assert.equal(r.code, 1);
  assert.match(r.json().error, /develop/);
});
