'use strict';
const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = path.join(__dirname, '..', 'bin');

function runNode(script, { input = '', cwd, env = {}, args = [] } = {}) {
  const r = spawnSync('node', [path.join(BIN, script), ...args], {
    input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json: () => JSON.parse(r.stdout) };
}

function tmpRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sw-test-')));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-q', '-b', 'master');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
  g('add', '.');
  g('commit', '-qm', 'init');
  return dir;
}

module.exports = { BIN, runNode, tmpRepo };
