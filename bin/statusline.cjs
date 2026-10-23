#!/usr/bin/env node
'use strict';
// Shipwright statusline. Line 1 (only while a task is active): stage, size, branch, worktree, diff, ahead, DB.
// Line 2: model, context bar, cost, duration, dev-server port. Git info cached 5s per directory.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tryGit } = require('./lib/git.cjs');
const state = require('./lib/state.cjs');

const C = process.env.NO_COLOR
  ? { dim: '', b: '', g: '', y: '', r: '', c: '', m: '', x: '' }
  : { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', m: '\x1b[35m', x: '\x1b[0m' };
const SEP = ` ${C.dim}·${C.x} `;
const CACHE_MS = 5000;
const AUTOCOMPACT_BUFFER = 22500;

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function gitInfo(dir) {
  const key = Buffer.from(dir).toString('base64url').slice(-60);
  const cacheFile = path.join(os.tmpdir(), `sw-statusline-${key}.json`);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (Date.now() - c.t < CACHE_MS) return c.v;
  } catch {
    /* miss */
  }
  const top = tryGit(['rev-parse', '--show-toplevel'], dir);
  let v = null;
  if (top) {
    const porcelain = tryGit(['status', '--porcelain'], top) || '';
    let added = 0;
    let modified = 0;
    for (const l of porcelain.split('\n').filter(Boolean)) (l.startsWith('??') || l[0] === 'A' ? added++ : modified++);
    const gitDir = tryGit(['rev-parse', '--path-format=absolute', '--git-dir'], top);
    const common = tryGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], top);
    v = {
      top,
      branch: tryGit(['branch', '--show-current'], top) || tryGit(['rev-parse', '--short', 'HEAD'], top) || '?',
      worktree: !!gitDir && !!common && gitDir !== common,
      added,
      modified,
    };
  }
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* read-only tmp: skip cache */
  }
  return v;
}

function ahead(top, base) {
  if (!base) return 0;
  return Number(tryGit(['rev-list', '--count', `${base}..HEAD`], top)) || 0;
}

function contextPercent(d) {
  if (typeof d.context_window?.used_percentage === 'number') return Math.round(d.context_window.used_percentage);
  const size = d.context_window?.context_window_size || 0;
  const u = d.context_window?.current_usage || {};
  if (!size) return null;
  const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  return Math.min(100, Math.round(((used + AUTOCOMPACT_BUFFER) / size) * 100));
}

function bar(pct, width = 8) {
  const filled = Math.round((pct / 100) * width);
  const color = pct >= 80 ? C.r : pct >= 60 ? C.y : C.g;
  return `${color}${'▓'.repeat(filled)}${C.dim}${'░'.repeat(width - filled)}${C.x} ${color}${pct}%${C.x}`;
}

function duration(ms) {
  const m = Math.floor((ms || 0) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function portListening(port) {
  // lsof is ~20ms; only called while a task with a port is active.
  const { tryRun } = require('./lib/git.cjs');
  return !!tryRun('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
}

function main() {
  const d = readStdin();
  const dir = d.workspace?.current_dir || d.cwd || process.cwd();
  const g = gitInfo(dir);
  const s = g ? state.read(g.top) : null;
  const lines = [];

  if (s && s.stage && s.stage !== 'done') {
    const parts = [`⛵ ${C.b}${C.c}sw:${s.stage}${s.round ? ` ${s.round}/3` : ''}${C.x}`];
    if (s.size) parts.push(s.size);
    let br = `${C.m}${g.branch}${C.x}`;
    if (g.worktree) br += ` ${C.dim}⎇wt${C.x}`;
    if (g.added || g.modified) br += ` ${C.g}+${g.added}${C.x} ${C.y}~${g.modified}${C.x}`;
    parts.push(br);
    const n = ahead(g.top, s.base);
    if (n) parts.push(`↑${n}`);
    if (s.db && s.db.name) parts.push(`${C.dim}db:${C.x}${s.db.name}`);
    lines.push(parts.join(SEP));
  }

  const p2 = [`◆ ${d.model?.display_name || 'Claude'}`];
  const pct = contextPercent(d);
  if (pct !== null) p2.push(`ctx ${bar(pct)}`);
  if (typeof d.cost?.total_cost_usd === 'number') p2.push(`$${d.cost.total_cost_usd.toFixed(2)}`);
  if (d.cost?.total_duration_ms) p2.push(duration(d.cost.total_duration_ms));
  if (!lines.length && g) {
    let br = `${C.m}${g.branch}${C.x}`;
    if (g.worktree) br += ` ${C.dim}⎇wt${C.x}`;
    if (g.added || g.modified) br += ` ${C.g}+${g.added}${C.x} ${C.y}~${g.modified}${C.x}`;
    p2.push(br);
  }
  if (s && s.port && s.stage !== 'done' && portListening(s.port)) p2.push(`${C.g}api :${s.port}${C.x}`);
  lines.push(p2.join(SEP));

  process.stdout.write(lines.join('\n'));
}

try {
  main();
} catch {
  process.stdout.write('◆ sw');
}
