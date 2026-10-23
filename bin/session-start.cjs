#!/usr/bin/env node
'use strict';
// SessionStart: (1) keep ~/.claude/shipwright/bin in sync with the installed plugin version,
// (2) inject a tiny bootstrap (< 1KB) plus the active task, if any.
const fs = require('fs');
const path = require('path');
const { readInput, context, safe } = require('./lib/hook.cjs');
const { HOME } = require('./lib/config.cjs');
const { toplevel } = require('./lib/git.cjs');
const state = require('./lib/state.cjs');

function syncBin() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  if (!root) return;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const dest = path.join(HOME, 'bin');
  const stamp = path.join(dest, '.version');
  const installed = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : '';
  if (installed === manifest.version && !process.env.SW_FORCE_SYNC) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(path.join(root, 'bin'), dest, { recursive: true });
  fs.writeFileSync(stamp, manifest.version + '\n');
}

safe(() => {
  const { cwd = process.cwd() } = readInput();
  try {
    syncBin();
  } catch {
    /* non-fatal: skills fall back to ${CLAUDE_PLUGIN_ROOT}/bin */
  }

  const lines = [
    'Shipwright (sw) is installed. Feature or bug-fix work → /sw:ship <task> (it triages tiny/small/large).',
    'Flow: discover → architect [gate] → plan [gate] → worktree → build (TDD) → verify → review → llms-txt → pr → verify-dev → cleanup.',
    'Bugs/failures → /sw:debug. Questions, explanations and exploration → answer directly, no workflow.',
    'Scripts: ~/.claude/shipwright/bin. Repo env info (dev/prod domains, dev auth): CLAUDE.local.md.',
  ];

  const top = toplevel(cwd);
  if (top) {
    if (!fs.existsSync(path.join(top, 'CLAUDE.local.md'))) {
      lines.push('This repo has no CLAUDE.local.md yet — run /sw:init before the first /sw:ship here.');
    }
    const s = state.read(top);
    if (s && s.stage && s.stage !== 'done') {
      lines.push(`Active task in this worktree: ${s.slug} (${s.size}), stage ${s.stage}${s.round ? ` round ${s.round}` : ''}. Resume with /sw:ship --resume.`);
    }
  }

  context('SessionStart', lines.join('\n'));
});
