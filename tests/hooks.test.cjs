'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runNode, tmpRepo } = require('./helpers.cjs');

const decision = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow');

test('guard-read: asks for secrets, allows examples and normal files', () => {
  const read = (file_path) => decision(runNode('guard-read.cjs', { input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path } }) }));
  assert.equal(read('/r/.env'), 'ask');
  assert.equal(read('/r/.env.production'), 'ask');
  assert.equal(read('/r/certs/server.key'), 'ask');
  assert.equal(read('/r/.env.example'), 'allow');
  assert.equal(read('/r/src/env.ts'), 'allow');
  assert.equal(read('/r/node_modules/x/index.d.ts'), 'allow');
});

test('guard-read: denies searching heavy dirs', () => {
  const grep = (p) => decision(runNode('guard-read.cjs', { input: JSON.stringify({ tool_name: 'Grep', tool_input: { pattern: 'x', path: p } }) }));
  assert.equal(grep('/r/node_modules'), 'deny');
  assert.equal(grep('/r/src'), 'allow');
  const glob = decision(runNode('guard-read.cjs', { input: JSON.stringify({ tool_name: 'Glob', tool_input: { pattern: 'dist/**/*.js' } }) }));
  assert.equal(glob, 'deny');
});

test('guard-read: survives garbage input', () => {
  assert.equal(runNode('guard-read.cjs', { input: 'not json' }).code, 0);
});

test('guard-bash: secret dumps ask, normal commands allowed', () => {
  const bash = (command) => decision(runNode('guard-bash.cjs', { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }) }));
  assert.equal(bash('cat .env'), 'ask');
  assert.equal(bash('head -5 apps/api/.env.local'), 'ask');
  assert.equal(bash('cat .env.example'), 'allow');
  assert.equal(bash('ls -la'), 'allow');
  assert.equal(bash('grep -o "^[A-Z_]*=" .env'), 'allow');
});

test('guard-bash: blocks commit/push while auth-bypass marker exists', () => {
  const dir = tmpRepo();
  const bash = (command) => decision(runNode('guard-bash.cjs', { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: dir }) }));
  assert.equal(bash('git commit -m x'), 'allow');
  fs.writeFileSync(path.join(dir, 'guard.ts'), 'return true; // @sw-auth-bypass\n');
  assert.equal(bash('git commit -m x'), 'deny');
  assert.equal(bash('git push origin HEAD'), 'deny');
  assert.equal(bash('gh pr create --fill'), 'deny');
  assert.equal(bash('git status'), 'allow');
  fs.writeFileSync(path.join(dir, 'NOTES.md'), 'docs mention @sw-auth-bypass\n');
  fs.rmSync(path.join(dir, 'guard.ts'));
  assert.equal(bash('git commit -m x'), 'allow', 'markdown mentions are ignored');
});

test('auth-bypass: start → edit → restore leaves the file pristine', () => {
  const dir = tmpRepo();
  const file = path.join(dir, 'auth.guard.ts');
  fs.writeFileSync(file, 'export const canActivate = () => checkJwt();\n');
  assert.equal(runNode('auth-bypass.cjs', { cwd: dir, args: ['start', 'auth.guard.ts'] }).code, 0);
  fs.writeFileSync(file, 'export const canActivate = () => true; // @sw-auth-bypass\n');
  assert.equal(runNode('auth-bypass.cjs', { cwd: dir, args: ['check'] }).code, 1);
  assert.equal(runNode('auth-bypass.cjs', { cwd: dir, args: ['restore'] }).code, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), 'export const canActivate = () => checkJwt();\n');
  assert.equal(runNode('auth-bypass.cjs', { cwd: dir, args: ['check'] }).code, 0);
});

test('auth-bypass: restore fails loudly if a marker was added without snapshot', () => {
  const dir = tmpRepo();
  fs.writeFileSync(path.join(dir, 'x.ts'), '// @sw-auth-bypass\n');
  assert.equal(runNode('auth-bypass.cjs', { cwd: dir, args: ['restore'] }).code, 1);
});

test('session-start: emits small bootstrap and init hint', () => {
  const dir = tmpRepo();
  const r = runNode('session-start.cjs', { input: JSON.stringify({ cwd: dir }), env: { CLAUDE_PLUGIN_ROOT: '' } });
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /\/sw:ship/);
  assert.match(ctx, /\/sw:init/);
  assert.ok(Buffer.byteLength(ctx) < 1024, `bootstrap is ${Buffer.byteLength(ctx)} bytes`);
});

test('session-start: syncs bin into SW_HOME', () => {
  const fsx = require('fs');
  const os = require('os');
  const home = fsx.mkdtempSync(path.join(os.tmpdir(), 'sw-home-'));
  const root = path.join(__dirname, '..');
  runNode('session-start.cjs', { input: '{}', env: { CLAUDE_PLUGIN_ROOT: root, SW_HOME: home } });
  assert.ok(fsx.existsSync(path.join(home, 'bin', 'wt.cjs')));
  assert.ok(fsx.existsSync(path.join(home, 'bin', '.version')));
});
