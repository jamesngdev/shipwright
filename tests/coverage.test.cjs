'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runNode, tmpRepo } = require('./helpers.cjs');

function repoWithChanges() {
  const dir = tmpRepo();
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('switch', '-qc', 'feat/x');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/refund.service.ts'), 'x\n');
  fs.writeFileSync(path.join(dir, 'src/refund.service.spec.ts'), 'x\n');
  fs.writeFileSync(path.join(dir, 'src/refund.dto.ts'), 'x\n');
  fs.writeFileSync(path.join(dir, 'src/orders.controller.ts'), 'x\n');
  g('add', '.');
  g('commit', '-qm', 'feat');
  return dir;
}

const lcov = (dir, entries) => {
  fs.mkdirSync(path.join(dir, 'coverage'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'coverage/lcov.info'), entries.map(([f, lf, lh]) => `SF:${path.join(dir, f)}\nLF:${lf}\nLH:${lh}\nend_of_record`).join('\n'));
};

test('coverage-changed: passes when every changed source file ≥ 80%, ignores tests/dto', () => {
  const dir = repoWithChanges();
  lcov(dir, [['src/refund.service.ts', 10, 9], ['src/orders.controller.ts', 20, 16]]);
  const r = runNode('coverage-changed.cjs', { cwd: dir, args: ['--base', 'master'] });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /2\/2 changed files/);
  assert.doesNotMatch(r.stdout, /spec|dto/);
});

test('coverage-changed: fails below threshold and for unexercised files', () => {
  const dir = repoWithChanges();
  lcov(dir, [['src/refund.service.ts', 10, 5]]);
  const r = runNode('coverage-changed.cjs', { cwd: dir, args: ['--base', 'master'] });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /FAIL {2}src\/refund\.service\.ts {2}50%/);
  assert.match(r.stdout, /FAIL {2}src\/orders\.controller\.ts {2}\(no coverage data/);
});
