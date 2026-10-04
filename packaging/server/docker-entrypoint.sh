#!/bin/sh
# Container start: make the office shared with the agent user, then hand over
# to the server (tini reaps the agents' processes).
set -e
office="${MD_OFFICE:-/office}"
mkdir -p "$office" "$MD_DATA_DIR"
chmod 700 "$MD_DATA_DIR"
chgrp office "$office" && chmod 2775 "$office"
chown agent:office "$MD_AGENT_HOME"
# The key must be out of the agents' reach: chmod 600 it on the host.
if [ -n "$MD_SECRET_KEY_FILE" ] && su agent -s /bin/sh -c "test -r '$MD_SECRET_KEY_FILE'" 2>/dev/null; then
  echo "WARNING: agents can read $MD_SECRET_KEY_FILE — run: chmod 600 secret.key (on the host)" >&2
fi
exec node /opt/munder-difflin/index.cjs "$@"
