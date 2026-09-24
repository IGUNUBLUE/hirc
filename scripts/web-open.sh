#!/usr/bin/env bash
# Ensure the web console is up, then open it in the browser.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/web-daemon.sh" start
URL="http://127.0.0.1:${HIRC_PORT:-9344}"
if command -v xdg-open >/dev/null; then xdg-open "$URL"
elif command -v open >/dev/null; then open "$URL"
else echo "open $URL in your browser"; fi
