'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { runNode, tmpRepo } = require('./helpers.cjs');
const state = require('../bin/lib/state.cjs');

const input = (dir) => JSON.stringify({
  model: { display_name: 'Opus 5.5' },
  workspace: { current_dir: dir },
  cost: { total_cost_usd: 1.842, total_duration_ms: 23 * 60000 },
  context_window: { context_window_size: 200000, current_usage: { input_tokens: 60000, cache_read_input_tokens: 13500 } },
});

test('statusline: one line without an active task', () => {
  const dir = tmpRepo();
  const r = runNode('statusline.cjs', { input: input(dir), env: { NO_COLOR: '1' } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout.split('\n').length, 1);
  assert.match(r.stdout, /Opus 5\.5 · ctx ▓+░+ 48% · \$1\.84 · 23m · master/);
});

test('statusline: two lines with an active task', () => {
  const dir = tmpRepo();
  state.write(dir, { slug: 'order-refund', size: 'large', stage: 'verify', round: 2, base: 'master', db: { name: 'app_wt_order_refund' } });
  const r = runNode('statusline.cjs', { input: input(dir), env: { NO_COLOR: '1' } });
  const [l1, l2] = r.stdout.split('\n');
  assert.match(l1, /⛵ sw:verify 2\/3 · large · master/);
  assert.match(l1, /db:app_wt_order_refund/);
  assert.match(l2, /^◆ Opus 5\.5/);
});

test('statusline: never crashes on empty input', () => {
  const r = runNode('statusline.cjs', { input: '' });
  assert.equal(r.code, 0);
  assert.ok(r.stdout.length > 0);
});
