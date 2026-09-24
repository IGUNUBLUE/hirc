#!/usr/bin/env bash
# hirc uninstall — removes only what install.sh created.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

link="$HOME/.local/bin/hirc"
if [ -L "$link" ] && [ "$(readlink -f "$link")" = "$PLUGIN_ROOT/bin/hirc" ]; then
  rm -f "$link"
  echo "hirc: removed $link"
fi

for base in \
  "$HOME/.config/devin/skills" \
  "$HOME/.claude/skills" \
  "$HOME/.agents/skills" \
  "$HOME/.codex/skills" \
  "$HOME/.config/opencode/skills" \
  "$HOME/.config/agy/skills"; do
  f="$base/hirc/SKILL.md"
  if [ -L "$f" ] && [ "$(readlink -f "$f")" = "$PLUGIN_ROOT/skills/hirc/SKILL.md" ]; then
    rm -rf "$base/hirc"
    echo "hirc: removed $base/hirc"
  fi
done

rm -rf "$HOME/.local/state/herdr/plugins/hirc"
echo "hirc: uninstall complete — run \`herdr plugin unlink hirc\` to unregister"
