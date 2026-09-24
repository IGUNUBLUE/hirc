#!/usr/bin/env bash
# hirc install — runs as the plugin's [[build]] step.
# Puts `hirc` on PATH and exposes skills/hirc/SKILL.md to every detected
# agent harness via symlinks, so any agent kind can learn the protocol.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- CLI on PATH ---
mkdir -p "$HOME/.local/bin"
ln -sfn "$PLUGIN_ROOT/bin/hirc" "$HOME/.local/bin/hirc"
chmod +x "$PLUGIN_ROOT/bin/hirc"
echo "hirc: CLI linked at $HOME/.local/bin/hirc"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) echo "hirc: WARNING — $HOME/.local/bin is not on PATH" ;;
esac

# --- Message log state dir ---
mkdir -p "$HOME/.local/state/herdr/plugins/hirc"

# --- Skill into detected harness skill dirs (symlink → auto-updates) ---
installed=0
for base in \
  "$HOME/.config/devin/skills" \
  "$HOME/.claude/skills" \
  "$HOME/.agents/skills" \
  "$HOME/.codex/skills" \
  "$HOME/.config/opencode/skills" \
  "$HOME/.config/agy/skills"; do
  if [ -d "$base" ]; then
    mkdir -p "$base/hirc"
    ln -sfn "$PLUGIN_ROOT/skills/hirc/SKILL.md" "$base/hirc/SKILL.md"
    echo "hirc: skill installed → $base/hirc/"
    installed=$((installed + 1))
  fi
done
[ "$installed" -eq 0 ] && echo "hirc: no known skill dirs found — agents can still run \`hirc skill\`"

echo "hirc: install complete"
