'use strict';
// Per-task state at <worktree>/.sw-state.json — written by stages, read by the statusline.
const fs = require('fs');
const path = require('path');

const FILE = '.sw-state.json';

function file(dir) {
  return path.join(dir, FILE);
}

function read(dir) {
  try {
    return JSON.parse(fs.readFileSync(file(dir), 'utf8'));
  } catch {
    return null;
  }
}

function write(dir, patch) {
  const next = { ...(read(dir) || {}), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file(dir), JSON.stringify(next, null, 2) + '\n');
  return next;
}

module.exports = { FILE, file, read, write };
