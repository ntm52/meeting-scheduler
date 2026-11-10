#!/usr/bin/env bash
# Run on the Linux PC with:  sudo bash ~/meeting-scheduler/deploy/install-services.sh
# Installs the app + Cloudflare quick tunnel as systemd services that start on boot.
set -euo pipefail
U=${SUDO_USER:?run this with sudo}
H=$(getent passwd "$U" | cut -d: -f6)
DIR="$H/meeting-scheduler"
NODE="$H/.local/node/bin/node"
CF="$H/.local/bin/cloudflared"
[ -x "$NODE" ] || { echo "Node not found at $NODE"; exit 1; }
[ -x "$CF" ] || { echo "cloudflared not found at $CF"; exit 1; }

install -m 755 "$CF" /usr/local/bin/cloudflared
install -m 755 "$DIR/deploy/ms-url" /usr/local/bin/ms-url

sed -e "s|__USER__|$U|" -e "s|__DIR__|$DIR|" -e "s|__NODE__|$NODE|" \
  "$DIR/deploy/meeting-scheduler.service" > /etc/systemd/system/meeting-scheduler.service
sed -e "s|__USER__|$U|" \
  "$DIR/deploy/meeting-scheduler-tunnel.service" > /etc/systemd/system/meeting-scheduler-tunnel.service

systemctl daemon-reload
systemctl enable --now meeting-scheduler.service
systemctl enable --now meeting-scheduler-tunnel.service

echo "Waiting for the tunnel URL..."
for i in $(seq 1 30); do
  if url=$(ms-url 2>/dev/null); then echo; echo "Meeting Scheduler is live at: $url"; exit 0; fi
  sleep 1
done
echo "Tunnel started but no URL yet. Run 'ms-url' in a few seconds."
