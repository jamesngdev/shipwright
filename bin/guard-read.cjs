#!/usr/bin/env node
'use strict';
// PreToolUse(Read|Grep|Glob): ask before reading secrets, deny searching generated/vendor dirs.
const { readInput, decide, safe } = require('./lib/hook.cjs');
const { isSecretPath, heavyDirIn } = require('./lib/patterns.cjs');

safe(() => {
  const { tool_name: tool, tool_input: input = {} } = readInput();

  if (tool === 'Read') {
    if (isSecretPath(input.file_path)) {
      decide('ask', `Secret file (${input.file_path}). Prefer listing variable names only: grep -o '^[A-Za-z_][A-Za-z0-9_]*=' <file>`);
    }
    return; // reading one specific file elsewhere (even in node_modules) is fine
  }

  if (tool === 'Grep' || tool === 'Glob') {
    const target = input.path || '';
    const dir = heavyDirIn(target) || heavyDirIn(tool === 'Glob' ? input.pattern : '');
    if (dir) {
      decide('deny', `Searching inside "${dir}" wastes tokens (generated/vendor code). Search source dirs instead, or Read one exact file if you must inspect a dependency.`);
    }
  }
});
