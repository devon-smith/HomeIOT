#!/usr/bin/env bash
#
# Start the brain + all five adapters in a tmux session named "brain".
# Each process gets its own window so you can watch logs independently.
#
#   ./scripts/run-all.sh             # all mock (default)
#   SONOS_MODE=real ./scripts/run-all.sh   # selectively real
#
# Reattach later:   tmux attach -t brain
# Stop everything:  tmux kill-session -t brain

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="brain"

SONOS_MODE="${SONOS_MODE:-mock}"
TV_MODE="${TV_MODE:-mock}"
CONTROL4_MODE="${CONTROL4_MODE:-mock}"
IAQUALINK_MODE="${IAQUALINK_MODE:-mock}"
TUYA_MODE="${TUYA_MODE:-mock}"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "session '$SESSION' already exists — attach with: tmux attach -t $SESSION"
  echo "or kill it first: tmux kill-session -t $SESSION"
  exit 1
fi

# Backing services must be up first.
(cd "$REPO_ROOT" && docker compose up -d)

tmux new-session  -d -s "$SESSION" -n brain -c "$REPO_ROOT"
tmux send-keys    -t "$SESSION:brain" "pnpm dev" C-m

tmux new-window   -t "$SESSION" -n sonos -c "$REPO_ROOT"
tmux send-keys    -t "$SESSION:sonos" "SONOS_MODE=$SONOS_MODE pnpm sonos" C-m

tmux new-window   -t "$SESSION" -n tv -c "$REPO_ROOT"
tmux send-keys    -t "$SESSION:tv" "TV_MODE=$TV_MODE pnpm tv" C-m

tmux new-window   -t "$SESSION" -n c4 -c "$REPO_ROOT/adapters-py/control4"
tmux send-keys    -t "$SESSION:c4" "CONTROL4_MODE=$CONTROL4_MODE python3 -m home_brain_control4.main" C-m

tmux new-window   -t "$SESSION" -n iaq -c "$REPO_ROOT/adapters-py/iaqualink"
tmux send-keys    -t "$SESSION:iaq" "IAQUALINK_MODE=$IAQUALINK_MODE python3 -m home_brain_iaqualink.main" C-m

tmux new-window   -t "$SESSION" -n tuya -c "$REPO_ROOT/adapters-py/tuya"
tmux send-keys    -t "$SESSION:tuya" "TUYA_MODE=$TUYA_MODE python3 -m home_brain_tuya.main" C-m

tmux select-window -t "$SESSION:brain"

echo "started tmux session '$SESSION' with 6 windows:"
echo "  brain · sonos($SONOS_MODE) · tv($TV_MODE) · c4($CONTROL4_MODE) · iaq($IAQUALINK_MODE) · tuya($TUYA_MODE)"
echo
echo "  attach:    tmux attach -t $SESSION"
echo "  dashboard: http://localhost:3000"
echo "  stop all:  tmux kill-session -t $SESSION"
