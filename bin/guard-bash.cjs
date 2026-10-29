#!/usr/bin/env node
'use strict';
// PreToolUse(Bash):
//  1. Block git commit/push (and gh pr create) while any @sw-auth-bypass marker exists.
//  2. Ask before dumping secret files (cat .env, etc.).
const path = require('path');
const { readInput, decide, safe } = require('./lib/hook.cjs');
const { tryGit, toplevel } = require('./lib/git.cjs');
const { markerGrepArgs } = require('./lib/patterns.cjs');

const MARKER = '@sw-auth-bypass';
const COMMIT_RE = /\bgit\s+(?:-C\s+\S+\s+)?(?:commit|push)\b|\bgh\s+pr\s+create\b/;
const SECRET_READ_RE = /\b(?:cat|less|more|head|tail|bat|nl|strings|xxd|base64)\b[^|;&]*?(?:^|[\s/'"])\.env(?:\.(?!example\b|sample\b|template\b)[\w.-]+)?(?=$|[\s'"|;&])/;

function markerHits(cwd) {
  const top = toplevel(cwd);
  const out = top ? tryGit(markerGrepArgs(MARKER, top), top) : null;
  return out ? out.split('\n').filter(Boolean) : [];
}

safe(() => {
  const { tool_input: input = {}, cwd = process.cwd() } = readInput();
  const cmd = String(input.command || '');

  if (COMMIT_RE.test(cmd)) {
    const dashC = cmd.match(/\bgit\s+-C\s+(\S+)/);
    const dir = dashC ? path.resolve(cwd, dashC[1].replace(/^['"]|['"]$/g, '')) : cwd;
    const hits = markerHits(dir);
    if (hits.length) {
      decide('deny', `Auth bypass still present (${MARKER}):\n${hits.slice(0, 10).join('\n')}\nRestore first: node ~/.claude/shipwright/bin/auth-bypass.cjs restore`);
    }
  }

  if (SECRET_READ_RE.test(cmd)) {
    decide('ask', 'Command prints a secret env file. Prefer variable names only: grep -o \'^[A-Za-z_][A-Za-z0-9_]*=\' .env');
  }
});
