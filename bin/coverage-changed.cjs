#!/usr/bin/env node
'use strict';
// Line coverage of files changed vs a base branch.
//   coverage-changed.cjs --base master [--lcov coverage/lcov.info | --go cover.out] [--min 80]
// Exit 1 when any changed source file is below --min. Test files and non-source files are ignored.
const fs = require('fs');
const path = require('path');
const { git, toplevel } = require('./lib/git.cjs');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const top = toplevel(process.cwd()) || process.cwd();
const base = opt('base', 'master');
const min = Number(opt('min', 80));

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|go|vue|svelte)$/;
const TEST = /(\.(spec|test|e2e-spec)\.[jt]sx?$|_test\.go$|\/(__tests__|test|tests|e2e)\/|\.d\.ts$|\.(config|setup)\.[jt]s$|\/migrations?\/|\/dto\/|\.dto\.ts$|\.module\.ts$|main\.ts$)/;

const mergeBase = git(['merge-base', base, 'HEAD'], top);
const changed = git(['diff', '--name-only', '--diff-filter=AM', mergeBase], top)
  .split('\n')
  .filter((f) => f && SOURCE.test(f) && !TEST.test(f));

function fromLcov(file) {
  const cov = {};
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) cur = path.relative(top, path.resolve(top, line.slice(3)));
    else if (line.startsWith('LF:') && cur) cov[cur] = { ...(cov[cur] || {}), total: Number(line.slice(3)) };
    else if (line.startsWith('LH:') && cur) cov[cur] = { ...(cov[cur] || {}), hit: Number(line.slice(3)) };
  }
  return cov;
}

function fromGo(file) {
  // mode line, then "module/path/file.go:l.c,l.c stmts count"
  const mod = (fs.readFileSync(path.join(top, 'go.mod'), 'utf8').match(/^module\s+(\S+)/m) || [])[1] || '';
  const cov = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n').slice(1)) {
    const m = line.match(/^(.+?):\S+ (\d+) (\d+)$/);
    if (!m) continue;
    const rel = m[1].startsWith(mod + '/') ? m[1].slice(mod.length + 1) : m[1];
    const c = (cov[rel] = cov[rel] || { total: 0, hit: 0 });
    c.total += Number(m[2]);
    if (Number(m[3]) > 0) c.hit += Number(m[2]);
  }
  return cov;
}

const lcov = opt('lcov', fs.existsSync(path.join(top, 'coverage/lcov.info')) ? 'coverage/lcov.info' : null);
const goOut = opt('go', null);
if (!lcov && !goOut) {
  console.error('No coverage file. Run tests with lcov output (jest --coverage --coverageReporters=lcov, vitest --coverage.reporter=lcov) or go test -coverprofile=cover.out, then pass --lcov/--go.');
  process.exit(2);
}
const cov = goOut ? fromGo(path.resolve(top, goOut)) : fromLcov(path.resolve(top, lcov));

let failed = 0;
const rows = changed.map((f) => {
  const c = cov[f];
  if (!c || !c.total) {
    failed++;
    return `FAIL  ${f}  (no coverage data — not exercised by any test)`;
  }
  const pct = Math.round((c.hit / c.total) * 1000) / 10;
  const ok = pct >= min;
  if (!ok) failed++;
  return `${ok ? 'ok  ' : 'FAIL'}  ${f}  ${pct}% (${c.hit}/${c.total})`;
});

console.log(changed.length ? rows.join('\n') : 'No changed source files.');
console.log(`\n${changed.length - failed}/${changed.length} changed files ≥ ${min}% line coverage`);
process.exit(failed ? 1 : 0);
