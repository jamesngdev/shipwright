#!/usr/bin/env node
'use strict';
// Read/update the task state of the current worktree (drives the statusline and --resume).
//   state.cjs get
//   state.cjs set stage=verify round=2 size=large
//   state.cjs clear
const { toplevel } = require('./lib/git.cjs');
const state = require('./lib/state.cjs');

const top = toplevel(process.cwd()) || process.cwd();
const [cmd, ...pairs] = process.argv.slice(2);

if (cmd === 'set') {
  const patch = {};
  for (const p of pairs) {
    const i = p.indexOf('=');
    if (i < 1) continue;
    const v = p.slice(i + 1);
    patch[p.slice(0, i)] = /^\d+$/.test(v) ? Number(v) : v === 'null' ? null : v;
  }
  console.log(JSON.stringify(state.write(top, patch)));
} else if (cmd === 'clear') {
  require('fs').rmSync(state.file(top), { force: true });
  console.log('cleared');
} else {
  console.log(JSON.stringify(state.read(top)));
}
