#!/usr/bin/env bash
# Action → pane bridge: `open-plugin-pane.sh roster` opens the matching pane.
set -euo pipefail
exec herdr plugin pane open --plugin hirc --entrypoint "$1"
