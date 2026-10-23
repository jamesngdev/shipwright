'use strict';
// Minimal dotenv read/rewrite that preserves comments, order and quoting style.
const fs = require('fs');

const LINE_RE = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_.]*)(\s*=\s*)(.*)$/;

// Env files a worktree needs. Never production/staging secrets.
const WANTED = /^\.env(?:\.local|\.development(?:\.local)?|\.dev|\.test(?:\.local)?)?$/;

function unquote(raw) {
  const v = raw.trim();
  const m = v.match(/^(['"])(.*)\1$/);
  return m ? m[2] : v.replace(/\s+#.*$/, '');
}

function parse(text) {
  const vars = {};
  for (const line of text.split('\n')) {
    const m = line.match(LINE_RE);
    if (m) vars[m[2]] = unquote(m[4]);
  }
  return vars;
}

function read(file) {
  return parse(fs.readFileSync(file, 'utf8'));
}

// patch: { KEY: value } — replaces existing keys in place, appends missing ones.
function rewrite(file, patch) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const done = new Set();
  const out = lines.map((line) => {
    const m = line.match(LINE_RE);
    if (!m || !(m[2] in patch)) return line;
    done.add(m[2]);
    const q = m[4].trim().match(/^(['"])/);
    const val = q ? `${q[1]}${patch[m[2]]}${q[1]}` : patch[m[2]];
    return `${m[1]}${m[2]}${m[3]}${val}`;
  });
  const missing = Object.keys(patch).filter((k) => !done.has(k));
  if (missing.length) {
    if (out.length && out[out.length - 1] === '') out.pop();
    out.push('', '# added by shipwright worktree', ...missing.map((k) => `${k}=${patch[k]}`), '');
  }
  fs.writeFileSync(file, out.join('\n'));
}

module.exports = { WANTED, parse, read, rewrite };
