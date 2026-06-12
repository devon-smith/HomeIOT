#!/usr/bin/env bash
#
# Install (or reinstall) the Home Brain launchd UserAgent.
# Idempotent — safe to re-run after pulling a new plist template.
#
# What it does:
#   1. Substitutes REPO_PATH + USERNAME placeholders in the committed plist
#   2. Writes the result to ~/Library/LaunchAgents/com.homebrain.brain.plist
#   3. Unloads any previous version
#   4. Loads the new one (so it both runs now and at every future login)
#
# After this, no more SSH-and-run-./scripts/run-all.sh after a reboot.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$REPO_ROOT/scripts/com.homebrain.brain.plist"
DEST="$HOME/Library/LaunchAgents/com.homebrain.brain.plist"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

echo "Installing launchd UserAgent from $TEMPLATE..."
sed -e "s|REPO_PATH|$REPO_ROOT|g" -e "s|USERNAME|$(whoami)|g" "$TEMPLATE" > "$DEST"
echo "  wrote $DEST"

# Unload the previous version if loaded; ignore the error if not.
if launchctl list | grep -q "com.homebrain.brain"; then
  echo "  unloading previous version"
  launchctl unload "$DEST" 2>/dev/null || true
fi

echo "  loading"
launchctl load "$DEST"

echo
echo "Done. Verify with:"
echo "  launchctl list | grep homebrain"
echo "  tail -f ~/Library/Logs/home-brain-boot.log"
echo
echo "To stop autostart later:"
echo "  launchctl unload $DEST"
echo "To remove entirely:"
echo "  launchctl unload $DEST && rm $DEST"
