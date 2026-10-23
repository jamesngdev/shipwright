'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIXTURE = `# Mistake Log
keep me

# Post-Feature Auto-Chain: a → b
old chain

# Feature Branch Hygiene

\`\`\`bash
# Merge base must equal the base branch tip
git merge-base HEAD origin/master
\`\`\`

# Branch & PR Base: Always From the Worktree Base Branch
old pr rules

# YouTube Vault
keep me too
`;

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-claude-'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), FIXTURE);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'node old.cjs' }, hooks: { x: 1 } }));
  return dir;
}

const sh = (script, dir, args) => spawnSync('bash', [path.join(ROOT, script), ...args], { env: { ...process.env, SW_CLAUDE_DIR: dir }, encoding: 'utf8' });

test('install → uninstall round-trips CLAUDE.md and statusline', () => {
  const dir = sandbox();
  const inst = sh('install.sh', dir, ['--yes', '--no-plugin']);
  assert.equal(inst.status, 0, inst.stderr);

  const md = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.match(md, /<!-- shipwright:start -->[\s\S]*\/sw:ship[\s\S]*<!-- shipwright:end -->/);
  assert.match(md, /keep me\n/);
  assert.match(md, /# YouTube Vault\nkeep me too/);
  assert.doesNotMatch(md, /Post-Feature Auto-Chain|Feature Branch Hygiene|Branch & PR Base|Merge base must equal/);
  assert.ok(fs.existsSync(path.join(dir, 'shipwright', 'bin', 'wt.cjs')));
  assert.ok(fs.existsSync(path.join(dir, 'shipwright', 'config.json')));
  assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.startsWith('CLAUDE.md.')));

  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  assert.match(settings.statusLine.command, /shipwright\/bin\/statusline\.cjs/);
  assert.deepEqual(settings.hooks, { x: 1 });

  // idempotent: second install keeps exactly one block
  sh('install.sh', dir, ['--yes', '--no-plugin']);
  assert.equal((fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8').match(/shipwright:start/g) || []).length, 1);

  const un = sh('uninstall.sh', dir, ['--no-plugin']);
  assert.equal(un.status, 0, un.stderr);
  const after = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(after, /shipwright:start/);
  for (const h of ['# Mistake Log', '# Post-Feature Auto-Chain', '# Feature Branch Hygiene', 'Merge base must equal', '# Branch & PR Base', '# YouTube Vault']) {
    assert.ok(after.includes(h), `restored: ${h}`);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).statusLine.command, 'node old.cjs');
});
