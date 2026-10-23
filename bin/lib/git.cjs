'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

function tryRun(cmd, args, opts = {}) {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
}

const git = (args, cwd) => run('git', args, { cwd });
const tryGit = (args, cwd) => tryRun('git', args, { cwd });

function toplevel(cwd) {
  return tryGit(['rev-parse', '--show-toplevel'], cwd);
}

function realDir(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

// Root of the main checkout (parent of the common .git dir).
function mainRoot(cwd) {
  const common = tryGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  if (!common) return null;
  return path.basename(common) === '.git' ? path.dirname(common) : toplevel(cwd);
}

function isLinkedWorktree(cwd) {
  const gitDir = tryGit(['rev-parse', '--path-format=absolute', '--git-dir'], cwd);
  const common = tryGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  if (!gitDir || !common) return false;
  if (tryGit(['rev-parse', '--show-superproject-working-tree'], cwd)) return false; // submodule
  return realDir(gitDir) !== realDir(common);
}

function currentBranch(cwd) {
  return tryGit(['branch', '--show-current'], cwd) || '';
}

// Base for new branches: the main checkout's branch when it is a release-track
// branch; otherwise origin/HEAD, then master/main. Never develop.
function baseBranch(cwd, fallback = 'master') {
  const root = mainRoot(cwd) || cwd;
  const mainBranch = currentBranch(root);
  if (mainBranch && mainBranch !== 'develop') return mainBranch;
  const head = tryGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], root);
  if (head) return head.replace(/^origin\//, '');
  for (const b of [fallback, 'master', 'main']) {
    if (tryGit(['rev-parse', '--verify', '--quiet', b], root)) return b;
  }
  return fallback;
}

module.exports = { run, tryRun, git, tryGit, toplevel, mainRoot, isLinkedWorktree, currentBranch, baseBranch };
