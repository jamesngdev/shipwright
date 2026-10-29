'use strict';
const fs = require('fs');
const path = require('path');
// Shared path rules for the read/bash guards.

// Directories that are huge and generated: never search them.
const HEAVY_DIRS = ['node_modules', 'dist', 'build', '.next', '.nuxt', '.turbo', 'coverage', '.git', 'vendor', '.worktree', 'out', 'target', '.venv', 'venv', '__pycache__'];

const SAFE_ENV_SUFFIX = /\.(example|sample|template|dist|defaults?)$/i;

function isSecretPath(p) {
  if (!p) return false;
  const base = p.split(/[\\/]/).pop();
  if (/^\.env(\..+)?$/.test(base)) return !SAFE_ENV_SUFFIX.test(base);
  if (/\.(pem|key|p12|pfx|keystore|jks)$/i.test(base)) return true;
  if (/^(id_rsa|id_ed25519|id_ecdsa)$/.test(base)) return true;
  if (/^(credentials|service-account|serviceAccount)[\w-]*\.json$/i.test(base)) return true;
  return false;
}

function heavyDirIn(p) {
  if (!p) return null;
  const parts = p.split(/[\\/]/);
  return HEAVY_DIRS.find((d) => parts.includes(d)) || null;
}

// Markdown only mentions the auth-bypass marker. The kit's own guard, script, test and guide
// also contain it, so those are exempt, but only inside the kit repo itself.
const KIT_MARKER_FILES = ['bin/guard-bash.cjs', 'bin/auth-bypass.cjs', 'tests/hooks.test.cjs', 'site/guide.html'];

function isKitRepo(top) {
  try {
    return JSON.parse(fs.readFileSync(path.join(top, '.claude-plugin', 'plugin.json'), 'utf8')).name === 'sw';
  } catch {
    return false;
  }
}

// Pathspecs are anchored at the repo root (`:/`), so the scan does not depend on the hook's cwd.
function markerGrepArgs(marker, top) {
  const exempt = ['*.md', ...(isKitRepo(top) ? KIT_MARKER_FILES : [])];
  return ['grep', '--untracked', '-n', '-I', '-e', marker, '--', ':/', ...exempt.map((p) => `:(top,exclude)${p}`)];
}

module.exports = { HEAVY_DIRS, isSecretPath, heavyDirIn, markerGrepArgs };
