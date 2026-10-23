#!/usr/bin/env bash
# Shipwright installer.
#   ./install.sh [--yes] [--no-plugin] [--no-statusline] [--keep-claude-md-sections]
# Env: SW_CLAUDE_DIR (default ~/.claude) — point at a sandbox to test.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${SW_CLAUDE_DIR:-$HOME/.claude}"
SW_DIR="$CLAUDE_DIR/shipwright"
YES=0; PLUGIN=1; STATUS=1; SUPERSEDE=1
for a in "$@"; do
  case "$a" in
    --yes) YES=1 ;;
    --no-plugin) PLUGIN=0 ;;
    --no-statusline) STATUS=0 ;;
    --keep-claude-md-sections) SUPERSEDE=0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

confirm() { [ "$YES" = 1 ] && return 0; read -r -p "$1 [y/N] " r; [[ "$r" =~ ^[Yy]$ ]]; }
say() { printf '\033[36m⛵ %s\033[0m\n' "$*"; }

command -v node >/dev/null || { echo "node is required" >&2; exit 1; }
export SW_CLAUDE_DIR="$CLAUDE_DIR" SW_HOME="$SW_DIR"

say "Scripts → $SW_DIR/bin"
mkdir -p "$SW_DIR/bin"
cp -R "$ROOT/bin/." "$SW_DIR/bin/"
node -e "console.log(require('$ROOT/.claude-plugin/plugin.json').version)" > "$SW_DIR/bin/.version"
chmod +x "$SW_DIR"/bin/*.cjs

if [ ! -f "$SW_DIR/config.json" ]; then
  say "Default config → $SW_DIR/config.json (change with /sw:setup)"
  node -e "const c=require('$SW_DIR/bin/lib/config.cjs'); c.save(c.load())"
fi

say "CLAUDE.md managed block (backup in $CLAUDE_DIR/backups/)"
FLAG=""
if [ "$SUPERSEDE" = 1 ] && [ -f "$CLAUDE_DIR/CLAUDE.md" ] && grep -qE '^# (Post-Feature Auto-Chain|Feature Branch Hygiene|Branch & PR Base)' "$CLAUDE_DIR/CLAUDE.md"; then
  if confirm "Move the sections Shipwright replaces (Post-Feature Auto-Chain, Feature Branch Hygiene, Branch & PR Base) out of CLAUDE.md? (restored on uninstall)"; then FLAG="--supersede"; fi
fi
node "$SW_DIR/bin/install-lib.cjs" claude-md install $FLAG

if [ "$STATUS" = 1 ]; then
  say "Statusline (previous one saved for uninstall)"
  node "$SW_DIR/bin/install-lib.cjs" statusline install
fi

if [ "$PLUGIN" = 1 ]; then
  command -v claude >/dev/null || { echo "claude CLI not found — install the plugin manually: /plugin marketplace add $ROOT" >&2; exit 1; }
  say "Plugin sw@shipwright"
  claude plugin marketplace add "$ROOT" 2>/dev/null || claude plugin marketplace update shipwright
  claude plugin install sw@shipwright 2>/dev/null || claude plugin update sw@shipwright
  for p in superpowers@claude-plugins-official superpowers@superpowers-marketplace; do
    if claude plugin list 2>/dev/null | grep -q "${p%@*}"; then
      echo "⚠  ${p%@*} is installed and auto-triggers a competing workflow — consider: claude plugin uninstall $p"
      break
    fi
  done
fi

say "Done. Restart Claude Code, then run /sw:setup once and /sw:init in each repo."
