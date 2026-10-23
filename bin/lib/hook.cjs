'use strict';
// Helpers for Claude Code hook scripts: read JSON stdin, emit decisions. Never throw.
const fs = require('fs');

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function decide(permissionDecision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

function context(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
  process.exit(0);
}

// Hooks must never break the session: swallow crashes and allow.
function safe(fn) {
  try {
    fn();
  } catch {
    process.exit(0);
  }
}

module.exports = { readInput, decide, context, safe };
