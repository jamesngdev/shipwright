#!/usr/bin/env node
'use strict';
// Temporary auth bypass for local smoke tests — always reversible.
//   auth-bypass.cjs start <file...>   snapshot files BEFORE editing them
//   auth-bypass.cjs restore           put snapshots back, then verify no marker is left
//   auth-bypass.cjs check             exit 1 if any @sw-auth-bypass marker exists
// Every bypass edit must carry the comment marker `@sw-auth-bypass`.
const fs = require('fs');
const path = require('path');
const { toplevel, tryGit } = require('./lib/git.cjs');
const { markerGrepArgs } = require('./lib/patterns.cjs');

const MARKER = '@sw-auth-bypass';

function root() {
  const top = toplevel(process.cwd());
  if (!top) {
    console.error('Not inside a git repository.');
    process.exit(2);
  }
  return top;
}

function store(top) {
  return path.join(top, '.sw', 'auth-bypass');
}

function manifestPath(top) {
  return path.join(store(top), 'manifest.json');
}

function readManifest(top) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(top), 'utf8'));
  } catch {
    return { files: {} };
  }
}

function markerHits(top) {
  const out = tryGit(markerGrepArgs(MARKER, top), top);
  return out ? out.split('\n').filter(Boolean) : [];
}

function start(files) {
  const top = root();
  const m = readManifest(top);
  fs.mkdirSync(store(top), { recursive: true });
  for (const f of files) {
    const rel = path.relative(top, path.resolve(f));
    if (m.files[rel]) continue; // keep the first (pristine) snapshot
    const abs = path.join(top, rel);
    const existed = fs.existsSync(abs);
    const snap = path.join(store(top), Buffer.from(rel).toString('base64url'));
    if (existed) fs.copyFileSync(abs, snap);
    m.files[rel] = { snapshot: existed ? snap : null };
  }
  fs.writeFileSync(manifestPath(top), JSON.stringify(m, null, 2));
  console.log(`Snapshotted ${Object.keys(m.files).length} file(s). Tag every bypass edit with "${MARKER}".`);
}

function restore() {
  const top = root();
  const m = readManifest(top);
  for (const [rel, { snapshot }] of Object.entries(m.files)) {
    const abs = path.join(top, rel);
    if (snapshot) fs.copyFileSync(snapshot, abs);
    else fs.rmSync(abs, { force: true }); // file was created for the bypass
  }
  fs.rmSync(store(top), { recursive: true, force: true });
  const hits = markerHits(top);
  if (hits.length) {
    console.error(`Restored snapshots, but markers remain (edited without a snapshot?):\n${hits.join('\n')}`);
    process.exit(1);
  }
  console.log(`Restored ${Object.keys(m.files).length} file(s). No ${MARKER} markers left.`);
}

function check() {
  const hits = markerHits(root());
  if (hits.length) {
    console.error(hits.join('\n'));
    process.exit(1);
  }
  console.log('clean');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'start' && rest.length) start(rest);
else if (cmd === 'restore') restore();
else if (cmd === 'check') check();
else {
  console.error('Usage: auth-bypass.cjs start <file...> | restore | check');
  process.exit(2);
}
