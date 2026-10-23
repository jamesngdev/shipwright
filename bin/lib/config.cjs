'use strict';
// Global Shipwright config: ~/.claude/shipwright/config.json
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = process.env.SW_HOME || path.join(os.homedir(), '.claude', 'shipwright');
const CONFIG_PATH = path.join(HOME, 'config.json');

const DEFAULTS = {
  postgres: { host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'postgres' },
  redis: { host: 'localhost', port: 6379, password: '' },
  logsMcp: null,              // e.g. "kubectl-dev" — chosen in /sw:setup
  defaultBase: 'master',
  dbCloneMaxBytes: 100 * 1024 * 1024,
  worktreeDir: '.worktree',
};

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object'
      ? deepMerge(base[k] || {}, v)
      : v;
  }
  return out;
}

function load() {
  try {
    return deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return deepMerge(DEFAULTS, {});
  }
}

function save(cfg) {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

module.exports = { HOME, CONFIG_PATH, DEFAULTS, load, save, deepMerge };
