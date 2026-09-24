#!/usr/bin/env bash
# Live tail of the hirc message log.
set -euo pipefail
LOG="$HOME/.local/state/herdr/plugins/hirc/messages.jsonl"
mkdir -p "$(dirname "$LOG")"; touch "$LOG"
exec tail -n 40 -f "$LOG"
