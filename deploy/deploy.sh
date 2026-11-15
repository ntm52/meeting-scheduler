#!/usr/bin/env bash
# Run on your Mac from the meeting-scheduler folder:  ./deploy/deploy.sh user@host
# Builds the site, copies it to the Linux PC, installs server deps, restarts the app.
# (Restarting only the app keeps the same tunnel URL.)
set -euo pipefail
TARGET=${1:?usage: deploy.sh user@host}
# Relative to the remote user's home. (Don't use ~ here: it would expand on the Mac.)
REMOTE_DIR=${REMOTE_DIR:-meeting-scheduler}
# Reuse one SSH connection so the password is only asked once.
SSH_OPTS="-o ControlMaster=auto -o ControlPath=/tmp/ms-deploy-%r@%h:%p -o ControlPersist=120"
npm run build
rsync -az --delete -e "ssh $SSH_OPTS" \
  --exclude node_modules --exclude data --exclude .claude --exclude .git \
  ./ "$TARGET:$REMOTE_DIR/"
ssh $SSH_OPTS -t "$TARGET" "cd $REMOTE_DIR && export PATH=\$HOME/.local/node/bin:\$PATH && npm ci --omit=dev --no-audit --no-fund && sudo systemctl restart meeting-scheduler && echo 'Deployed. URL:' && ms-url"
