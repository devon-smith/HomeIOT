#!/usr/bin/env bash
#
# Resume work on the brain. Run this ON THE MAC MINI after you SSH in.
# It pulls the latest code, restarts the brain cleanly with the real
# backends (Sonos + iAquaLink) live, and leaves you attached to the
# tmux session so you can watch every adapter's logs.
#
#   ssh openclaw@opens-mac-mini
#   ~/code/HomeIOT/scripts/resume.sh
#
# Flags:
#   --no-pull     skip `git pull` (work with whatever is checked out)
#   --no-attach   start the session but don't attach (for scripts)
#   --all-mock    start everything in mock mode (no hardware needed)

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="brain"
BRANCH="claude/admiring-planck-CwkwR"

PULL=1
ATTACH=1
SONOS_MODE=real
IAQUALINK_MODE=real

for arg in "$@"; do
  case "$arg" in
    --no-pull)   PULL=0 ;;
    --no-attach) ATTACH=0 ;;
    --all-mock)  SONOS_MODE=mock; IAQUALINK_MODE=mock ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

cd "$REPO_ROOT"

if [ "$PULL" -eq 1 ]; then
  echo "==> git pull (branch $BRANCH)"
  git fetch origin "$BRANCH" && git pull origin "$BRANCH" || {
    echo "!! pull failed — continuing with the current checkout" >&2
  }
  echo "==> pnpm install (in case deps changed)"
  pnpm install --prefer-offline >/dev/null 2>&1 || echo "!! pnpm install hiccup — check manually if something is off" >&2
fi

# Tear down any running session so mode flags actually take effect. The
# launchd autostart may have brought one up on the last boot.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "==> killing existing '$SESSION' session"
  tmux kill-session -t "$SESSION"
fi

echo "==> starting brain (sonos=$SONOS_MODE iaqualink=$IAQUALINK_MODE, c4/tuya/tv=mock)"
SONOS_MODE="$SONOS_MODE" IAQUALINK_MODE="$IAQUALINK_MODE" ./scripts/run-all.sh

echo
echo "ready. dashboard: http://opens-mac-mini:3000/  (or http://localhost:3000)"

if [ "$ATTACH" -eq 1 ] && [ -t 1 ]; then
  echo "==> attaching (detach with: Ctrl-b then d)"
  exec tmux attach -t "$SESSION"
fi
