#!/usr/bin/env bash
# Run on your Mac from the meeting-scheduler folder:  ./deploy/deploy.sh user@host
# Builds the site, copies it to the Linux PC, installs server deps, restarts the app.
# (Restarting only the app keeps the same tunnel URL.)
set -euo pipefail
TARGET=${1:?usage: deploy.sh user@host}
REMOTE_DIR=${REMOTE_DIR:-~/meeting-scheduler}
npm run build
rsync -az --delete \
  --exclude node_modules --exclude data --exclude .claude --exclude .git \
  ./ "$TARGET:$REMOTE_DIR/"
ssh -t "$TARGET" "cd $REMOTE_DIR && export PATH=\$HOME/.local/node/bin:\$PATH && npm ci --omit=dev --no-audit --no-fund && sudo systemctl restart meeting-scheduler && echo 'Deployed. URL:' && ms-url"
