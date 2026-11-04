#!/usr/bin/env bash
# Installs the preset server (server/index.mjs) as a systemd service, so it keeps running
# after the terminal / SSH window is closed, restarts itself if it crashes, and starts on boot.
#
#   bash server/install-service.sh            # run as your normal user; it asks for sudo itself
#
# Settings (all optional, give them in front of the command, e.g. PORT=3900 bash server/install-service.sh):
#   NAME=orbrave                  systemd service name
#   PORT=3800                     must match Nginx: proxy_pass http://127.0.0.1:3800/api/;
#   HOST=127.0.0.1                behind Nginx, only listen locally
#   PRESET_ALLOWED_ORIGINS=https://r3coder.github.io
#   PRESET_DATA_DIR=...           default: taken from an already running copy, else ./data if it exists, else server/data
#   PRESET_MAX_PER_DAY=...        default: the server's own (2000)
#   NO_SLEEP=1                    also stop this machine from suspending (for a laptop / desktop used as a server)
#
# Afterwards:
#   systemctl status orbrave      is it running?
#   journalctl -u orbrave -f      logs
#   sudo systemctl restart orbrave   after git pull
set -euo pipefail

NAME=${NAME:-orbrave}
PORT=${PORT:-3800}
HOST=${HOST:-127.0.0.1}
ORIGINS=${PRESET_ALLOWED_ORIGINS:-https://r3coder.github.io}
APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
UNIT=/etc/systemd/system/$NAME.service

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run this as your normal user, without sudo (node is looked up in your PATH; it asks for sudo itself)"
RUN_USER=$(id -un)
command -v systemctl >/dev/null || die "systemd not found on this machine"
[ -f "$APP_DIR/server/index.mjs" ] || die "server/index.mjs not found in $APP_DIR"

# node: the one in this user's PATH (also works with nvm), at least version 18
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
[ -n "$NODE_BIN" ] || die "node not found in PATH"
NODE_BIN=$(readlink -f "$NODE_BIN")
NODE_MAJOR=$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "node $("$NODE_BIN" -v) is too old, need 18+"
say "app:  $APP_DIR"
say "node: $NODE_BIN ($("$NODE_BIN" -v)), user: $RUN_USER"

# Copies of this server started by hand (node server/index.mjs) — they are replaced by the service.
OLD_PIDS=()
for pid in $(pgrep -f 'server/index\.mjs' || true); do
  [ "$pid" = "$$" ] && continue
  cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || sudo readlink "/proc/$pid/cwd" 2>/dev/null || true)
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  if [ "$cwd" = "$APP_DIR" ] || [[ "$cmd" == *"$APP_DIR/server/index.mjs"* ]]; then
    OLD_PIDS+=("$pid")
  fi
done

# Keep the data folder of the copy that is already running, so shared presets and votes stay.
if [ -z "${PRESET_DATA_DIR:-}" ] && [ ${#OLD_PIDS[@]} -gt 0 ]; then
  env_of_old=$(sudo cat "/proc/${OLD_PIDS[0]}/environ" 2>/dev/null | tr '\0' '\n' || true)
  PRESET_DATA_DIR=$(sed -n 's/^PRESET_DATA_DIR=//p' <<<"$env_of_old" | head -n1)
  [ -z "${PRESET_MAX_PER_DAY:-}" ] && PRESET_MAX_PER_DAY=$(sed -n 's/^PRESET_MAX_PER_DAY=//p' <<<"$env_of_old" | head -n1)
fi
# Deploy layout with the data folder next to server/ (e.g. ~/orbrave/data)
if [ -z "${PRESET_DATA_DIR:-}" ] && [ -d "$APP_DIR/data/presets" ]; then
  PRESET_DATA_DIR=$APP_DIR/data
fi
say "data: ${PRESET_DATA_DIR:-server/data (default)}"

if [ ${#OLD_PIDS[@]} -gt 0 ]; then
  say "running by hand right now (will be replaced): pid ${OLD_PIDS[*]}"
fi

# Something else on the port? (not this app, not the service we are about to replace)
if command -v ss >/dev/null; then
  holder=$(sudo ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -n1 | cut -d= -f2 || true)
  if [ -n "$holder" ] && [[ " ${OLD_PIDS[*]} " != *" $holder "* ]] \
     && [ "$(systemctl show -p MainPID --value "$NAME" 2>/dev/null || echo 0)" != "$holder" ]; then
    die "port $PORT is used by another program (pid $holder: $(tr '\0' ' ' < /proc/$holder/cmdline 2>/dev/null)). Pick another: PORT=... and change Nginx too"
  fi
fi

EXTRA_ENV=""
[ -n "${PRESET_DATA_DIR:-}" ] && EXTRA_ENV+="Environment=\"PRESET_DATA_DIR=$PRESET_DATA_DIR\""$'\n'
[ -n "${PRESET_MAX_PER_DAY:-}" ] && EXTRA_ENV+="Environment=\"PRESET_MAX_PER_DAY=$PRESET_MAX_PER_DAY\""$'\n'

say "writing $UNIT"
sudo tee "$UNIT" >/dev/null <<EOF
[Unit]
Description=orbrave preset server (port $PORT)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN $APP_DIR/server/index.mjs
Environment="PORT=$PORT"
Environment="HOST=$HOST"
Environment="TRUST_PROXY=1"
Environment="PRESET_ALLOWED_ORIGINS=$ORIGINS"
$EXTRA_ENV
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

if [ ${#OLD_PIDS[@]} -gt 0 ]; then
  say "stopping the hand-started copy"
  kill "${OLD_PIDS[@]}" 2>/dev/null || sudo kill "${OLD_PIDS[@]}"
  sleep 1
fi

sudo systemctl daemon-reload
sudo systemctl enable "$NAME" >/dev/null
sudo systemctl restart "$NAME"

if [ "${NO_SLEEP:-0}" = 1 ]; then
  say "turning off suspend / hibernate on this machine (undo: sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target)"
  sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null
fi

say "checking http://$HOST:$PORT/api/presets"
ok=0
for _ in $(seq 1 15); do
  if command -v curl >/dev/null; then
    curl -fsS -m 2 "http://$HOST:$PORT/api/presets?limit=1" >/dev/null 2>&1 && { ok=1; break; }
  elif systemctl is-active --quiet "$NAME"; then
    ok=1; break
  fi
  sleep 1
done

if [ "$ok" = 1 ]; then
  say "done: $NAME is running and starts on boot"
  echo "   status: systemctl status $NAME"
  echo "   logs:   journalctl -u $NAME -f"
  echo "   after git pull: sudo systemctl restart $NAME"
else
  journalctl -u "$NAME" -n 30 --no-pager || true
  die "$NAME did not answer on port $PORT, see the log above"
fi
