#!/bin/sh
set -e

mkdir -p "$UPLOADS_DIR"

# Started as a non-root user (`user:` in compose, e.g. with cap_drop: [ALL]): the uploads
# directory must already be owned by that user, so just run the app.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

# Ensure the uploads directory is owned by the planly user regardless of how the
# bind mount was created on the host (Docker creates it as root when missing).
chown planly:planly "$UPLOADS_DIR"

exec su-exec planly "$@"
