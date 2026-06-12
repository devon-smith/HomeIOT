#!/usr/bin/env bash
#
# Run by the com.homebrain.brain launchd UserAgent at login/boot.
# Waits for Docker Desktop to come up, then starts the tmux brain session
# via run-all.sh. Idempotent — if the session already exists, exits cleanly.
#
# Logs go to ~/Library/Logs/home-brain-boot.log so launchd events are
# inspectable after a reboot.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$HOME/Library/Logs/home-brain-boot.log"
mkdir -p "$(dirname "$LOG")"

# All output (stdout + stderr) lands in the log from here on.
exec >> "$LOG" 2>&1

echo
echo "=== $(date) launchd-boot starting ==="
echo "REPO_ROOT=$REPO_ROOT  USER=$(whoami)  SHELL=$SHELL"

# launchd starts with a minimal PATH — graft Homebrew + Docker + tmux in.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
echo "PATH=$PATH"

# Wait up to 5 minutes for Docker Desktop to settle. After a cold boot the
# whale icon needs a moment to land in the menu bar.
echo "$(date) waiting for Docker..."
DOCKER_UP=0
for i in $(seq 1 60); do
  if docker ps >/dev/null 2>&1; then
    echo "$(date) Docker is up after ${i}*5s"
    DOCKER_UP=1
    break
  fi
  sleep 5
done
if [ "$DOCKER_UP" -ne 1 ]; then
  echo "$(date) Docker never came up after 5 minutes — bailing"
  exit 1
fi

# If a brain session is already running (e.g. SIGHUP reload, manual run),
# leave it alone.
if tmux has-session -t brain 2>/dev/null; then
  echo "$(date) brain session already exists — nothing to do"
  exit 0
fi

cd "$REPO_ROOT"
echo "$(date) starting run-all.sh"
./scripts/run-all.sh
echo "=== $(date) launchd-boot done ==="
