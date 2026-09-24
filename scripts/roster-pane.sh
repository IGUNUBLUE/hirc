#!/usr/bin/env bash
# Live agent roster for the popup pane.
set -euo pipefail
while true; do
  clear
  echo "hirc — agent roster  ($(date +%H:%M:%S))"
  echo
  hirc list || true
  echo
  echo "hirc send <address> \"msg\" · hirc ask <address> \"question\" · q to close"
  sleep 2
done
