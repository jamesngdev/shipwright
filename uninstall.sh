#!/usr/bin/env bash
# Shipwright uninstaller: removes the plugin, the CLAUDE.md block (restoring moved sections),
# and the statusline (restoring the previous one). Keeps ~/.claude/shipwright/config.json.
#   ./uninstall.sh [--no-plugin]
set -euo pipefail
CLAUDE_DIR="${SW_CLAUDE_DIR:-$HOME/.claude}"
SW_DIR="$CLAUDE_DIR/shipwright"
export SW_CLAUDE_DIR="$CLAUDE_DIR" SW_HOME="$SW_DIR"
LIB="$SW_DIR/bin/install-lib.cjs"
[ -f "$LIB" ] || LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bin/install-lib.cjs"

node "$LIB" claude-md uninstall
node "$LIB" statusline uninstall
if [ "${1:-}" != "--no-plugin" ] && command -v claude >/dev/null; then
  claude plugin uninstall sw@shipwright || true
  claude plugin marketplace remove shipwright || true
fi
rm -rf "$SW_DIR/bin"
echo "⛵ Shipwright removed (config kept at $SW_DIR/config.json; backups in $CLAUDE_DIR/backups/)."
