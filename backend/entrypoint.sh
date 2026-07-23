#!/bin/sh
set -e

# Ensure the uploads directory is owned by the planly user regardless of how the
# bind mount was created on the host (Docker creates it as root when missing).
mkdir -p "$UPLOADS_DIR"
chown planly:planly "$UPLOADS_DIR"

exec su-exec planly "$@"
