'use strict';
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

module.exports = { HEAVY_DIRS, isSecretPath, heavyDirIn };
