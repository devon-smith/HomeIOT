#!/usr/bin/env bash
#
# test-interpret.sh — sign and POST a command to the brain's /interpret
# endpoint, the same way the Alexa Lambda does. Paste-safe (run as a file,
# no shell-quoting hazards) and reusable.
#
# Reads HB_HMAC_SECRET from the environment, else from ./.env.
#
# Usage:
#   scripts/test-interpret.sh                                   # localhost:3000, default text
#   scripts/test-interpret.sh "dim the kitchen to 30"           # custom text, localhost
#   URL=https://home.natashabrain.com/interpret scripts/test-interpret.sh "turn off the patio"
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

TEXT="${1:-turn off the kitchen lights}"
URL="${URL:-http://localhost:${PORT:-3000}/interpret}"

SECRET="${HB_HMAC_SECRET:-}"
if [ -z "${SECRET:-}" ] && [ -f "$ENV_FILE" ]; then
  SECRET="$(grep -E '^HB_HMAC_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d ' ')" || true
fi
[ -n "${SECRET:-}" ] || { echo "No HB_HMAC_SECRET found (checked env + .env). Set it first." >&2; exit 1; }

TS="$(date +%s)000"
REQ="test-$(uuidgen 2>/dev/null || echo "$RANDOM$RANDOM")"
SIG="$(printf '%s' "$TS.$REQ.$TEXT" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')"
BODY="$(python3 -c 'import json,sys; print(json.dumps({"text":sys.argv[1],"source":"alexa","requestId":sys.argv[2]}))' "$TEXT" "$REQ")"

printf '\nPOST %s\n  text: "%s"\n\n' "$URL" "$TEXT"
curl -s -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H "X-HB-Timestamp: $TS" \
  -H "X-HB-Signature: $SIG" \
  --data-binary "$BODY"
printf '\n'
