#!/usr/bin/env node
'use strict';
// Installer helpers (called by install.sh / uninstall.sh).
//   install-lib.cjs claude-md install [--supersede]   write managed block (+ move superseded sections out)
//   install-lib.cjs claude-md uninstall               remove block, put superseded sections back
//   install-lib.cjs statusline install|uninstall
// Every change backs the file up to ~/.claude/backups/<name>.<timestamp> first.
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLAUDE_DIR = process.env.SW_CLAUDE_DIR || path.join(os.homedir(), '.claude');
const SW_DIR = path.join(CLAUDE_DIR, 'shipwright');
const CLAUDE_MD = path.join(CLAUDE_DIR, 'CLAUDE.md');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const REMOVED = path.join(SW_DIR, 'removed-claude-md-sections.md');
const STATUS_BACKUP = path.join(SW_DIR, 'previous-statusline.json');
const START = '<!-- shipwright:start -->';
const END = '<!-- shipwright:end -->';

// Top-level sections Shipwright replaces (matched by heading prefix).
const SUPERSEDED = ['# Post-Feature Auto-Chain', '# Feature Branch Hygiene', '# Branch & PR Base'];

const BLOCK = `${START}
# Shipwright workflow (managed by the sw plugin — edit via the plugin, not here)

- Feature or bug-fix work → \`/sw:ship <task>\`. Questions, explanations and exploration → answer directly.
- After the plan is approved, run to the PR without check-ins; stop only for destructive, security-sensitive or shared-side-effect actions (merge, push to shared branches, deploy), a broken plan, or failing verification after the retry budget.
- Every feature: verify (lint → typecheck → unit → integration, ≥80% coverage on changed files → build → dev server → API smoke → Playwright for frontend) → review → \`/sw:llms-txt\` → \`/sw:pr\` → \`/sw:verify-dev\`.
- Branches: start from the root worktree's branch (else \`master\`), never from \`develop\`. Non-tiny work happens in \`.worktree/\` via \`/sw:worktree\`.
- PRs: PR to the base branch (kept open, never auto-merged) + PR to \`develop\`; on conflict use \`integration/<branch>\` cut from develop. Never merge \`develop\`/\`master\` into a feature branch; rebase onto the base instead.
- Commits: 1–3 per ticket (squash checkpoints before the first push). Never force-push shared branches, never push to master/main/develop directly, never merge.
- Before pushing: the branch contains only its own commits on top of its base (\`git log origin/<base>..HEAD\` has no develop merges).
${END}`;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(CLAUDE_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${path.basename(file)}.${stamp()}`);
  fs.copyFileSync(file, dest);
  return dest;
}

// Split markdown into top-level (# ) sections, ignoring headings inside fenced code.
function sections(text) {
  const lines = text.split('\n');
  const out = [];
  let cur = { heading: null, lines: [] };
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && /^# /.test(line)) {
      out.push(cur);
      cur = { heading: line, lines: [] };
    }
    cur.lines.push(line);
  }
  out.push(cur);
  return out;
}

function stripBlock(text) {
  const re = new RegExp(`\\n*${START}[\\s\\S]*?${END}\\n*`, 'g');
  return text.replace(re, '\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function claudeMdInstall(supersede) {
  fs.mkdirSync(SW_DIR, { recursive: true });
  const original = fs.existsSync(CLAUDE_MD) ? fs.readFileSync(CLAUDE_MD, 'utf8') : '';
  const bak = backup(CLAUDE_MD);
  let text = stripBlock(original);
  const moved = [];
  if (supersede) {
    const keep = [];
    for (const s of sections(text)) {
      if (s.heading && SUPERSEDED.some((h) => s.heading.startsWith(h))) moved.push(s.lines.join('\n').trimEnd());
      else keep.push(s.lines.join('\n'));
    }
    text = keep.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    if (moved.length) {
      const prev = fs.existsSync(REMOVED) ? fs.readFileSync(REMOVED, 'utf8') : '';
      fs.writeFileSync(REMOVED, prev + moved.join('\n\n') + '\n\n');
    }
  }
  fs.writeFileSync(CLAUDE_MD, `${text.trim() ? text.trimEnd() + '\n\n' : ''}${BLOCK}\n`);
  console.log(JSON.stringify({ backup: bak, supersededSections: moved.map((m) => m.split('\n')[0]) }));
}

function claudeMdUninstall() {
  if (!fs.existsSync(CLAUDE_MD)) return console.log(JSON.stringify({ skipped: 'no CLAUDE.md' }));
  const bak = backup(CLAUDE_MD);
  let text = stripBlock(fs.readFileSync(CLAUDE_MD, 'utf8'));
  let restored = false;
  if (fs.existsSync(REMOVED)) {
    text = text.trimEnd() + '\n\n' + fs.readFileSync(REMOVED, 'utf8').trimEnd() + '\n';
    fs.rmSync(REMOVED);
    restored = true;
  }
  fs.writeFileSync(CLAUDE_MD, text);
  console.log(JSON.stringify({ backup: bak, restoredSections: restored }));
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch {
    return {};
  }
}

function statuslineInstall() {
  const s = readSettings();
  const bak = backup(SETTINGS);
  const cmd = `node ${path.join(SW_DIR, 'bin', 'statusline.cjs')}`;
  if (s.statusLine && s.statusLine.command !== cmd && !fs.existsSync(STATUS_BACKUP)) {
    fs.mkdirSync(SW_DIR, { recursive: true });
    fs.writeFileSync(STATUS_BACKUP, JSON.stringify(s.statusLine, null, 2));
  }
  s.statusLine = { type: 'command', command: cmd, padding: 0 };
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  console.log(JSON.stringify({ backup: bak, statusLine: s.statusLine }));
}

function statuslineUninstall() {
  const s = readSettings();
  const bak = backup(SETTINGS);
  if (fs.existsSync(STATUS_BACKUP)) {
    s.statusLine = JSON.parse(fs.readFileSync(STATUS_BACKUP, 'utf8'));
    fs.rmSync(STATUS_BACKUP);
  } else if (s.statusLine && String(s.statusLine.command).includes('shipwright')) {
    delete s.statusLine;
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n');
  console.log(JSON.stringify({ backup: bak, statusLine: s.statusLine || null }));
}

const [area, action, flag] = process.argv.slice(2);
if (area === 'claude-md' && action === 'install') claudeMdInstall(flag === '--supersede');
else if (area === 'claude-md' && action === 'uninstall') claudeMdUninstall();
else if (area === 'statusline' && action === 'install') statuslineInstall();
else if (area === 'statusline' && action === 'uninstall') statuslineUninstall();
else {
  console.error('Usage: install-lib.cjs claude-md install [--supersede] | claude-md uninstall | statusline install | statusline uninstall');
  process.exit(2);
}
