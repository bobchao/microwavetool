#!/bin/bash
# Starts a local static file server for this repo in Claude Code on the web.
#
# This app has no build step and no dependencies to install, but its
# service worker (service-worker.js) only registers over http(s)/localhost,
# not file://, so opening index.html directly can't be used to verify
# real behavior (offline caching, PWA install, camera capture). Serving it
# over localhost makes it testable with a browser tool immediately.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PORT=8000
URL="http://127.0.0.1:$PORT"

if ! curl -s -o /dev/null "$URL/"; then
  cd "$CLAUDE_PROJECT_DIR"
  nohup python3 -m http.server "$PORT" >/tmp/mw-dev-server.log 2>&1 &
  disown
fi

echo "export MW_DEV_SERVER_URL=\"$URL\"" >> "$CLAUDE_ENV_FILE"
