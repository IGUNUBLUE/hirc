#!/usr/bin/env bash
# hirc-web daemon manager: start|stop|status — pidfile in plugin state dir.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$HOME/.local/state/herdr/plugins/hirc"
PIDFILE="$STATE_DIR/web.pid"
HIRC_WEB="$PLUGIN_ROOT/bin/hirc-web"
mkdir -p "$STATE_DIR"

alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-start}" in
  start)
    if alive; then echo "hirc-web already running (pid $(cat "$PIDFILE"))"; exit 0; fi
    nohup "$HIRC_WEB" >>"$STATE_DIR/web.log" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 0.5
    alive && echo "hirc-web on http://127.0.0.1:${HIRC_PORT:-9344} (pid $(cat "$PIDFILE"))" \
          || { echo "hirc-web failed to start — see $STATE_DIR/web.log"; exit 1; }
    ;;
  stop)
    alive && kill "$(cat "$PIDFILE")" && echo "hirc-web stopped" || echo "hirc-web not running"
    rm -f "$PIDFILE"
    ;;
  status)
    alive && echo "running (pid $(cat "$PIDFILE")) http://127.0.0.1:${HIRC_PORT:-9344}" || echo "stopped"
    ;;
esac
