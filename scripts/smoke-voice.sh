#!/usr/bin/env bash
#
# smoke-voice.sh — fire a curated set of voice commands at /interpret
# and report pass/fail for each. Covers every adapter family + every
# zone so you can verify the brain reaches the right physical devices
# after a Cloudflare/Alexa/brain change.
#
# Defaults to localhost (skip the tunnel for fast iteration). Add
# URL=https://home.natashabrain.com/interpret to test the public path.
#
# Usage:
#   scripts/smoke-voice.sh                 # all suites against localhost
#   scripts/smoke-voice.sh lights climate  # only listed suites
#   URL=https://home.natashabrain.com/interpret scripts/smoke-voice.sh
#
# Suites: state lights climate skylights av music scenes scheduling
#
# Commands are intentionally read-only or reversible (toggle pairs).
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="${URL:-http://localhost:${PORT:-3000}/interpret}"

# Suite -> list of utterances ("|"-joined, one per line)
read -r -d '' STATE <<'EOF' || true
what's the temperature upstairs
is anything playing in the family room
which lights are on right now
EOF

read -r -d '' LIGHTS <<'EOF' || true
turn the kitchen lights off
turn the kitchen lights on
dim the family room to 30
set the foyer lights to 100
EOF

read -r -d '' CLIMATE <<'EOF' || true
what's the temperature in the master bedroom
set the upstairs to 70
set the downstairs to cool 72
EOF

read -r -d '' SKYLIGHTS <<'EOF' || true
open the kitchen skylights
close the kitchen skylights
open the foyer skylight
close the foyer skylight
EOF

read -r -d '' AV <<'EOF' || true
turn the theater on
turn off the theater
EOF

read -r -d '' MUSIC <<'EOF' || true
play smooth jazz in the kitchen at 20
pause music in the kitchen
EOF

read -r -d '' SCENES <<'EOF' || true
good morning
goodnight
EOF

read -r -d '' SCHEDULING <<'EOF' || true
turn off the kitchen lights in five minutes
cancel the kitchen lights schedule
EOF

SUITES=("state" "lights" "climate" "skylights" "av" "music" "scenes" "scheduling")
[ $# -gt 0 ] && SUITES=("$@")

PASS=0; FAIL=0; FAILED_LIST=()
ts() { printf '\033[2m[%s]\033[0m' "$(date +%H:%M:%S)"; }

run_suite() {
  local name="$1" lines="$2"
  printf '\n\033[1;34m── %s ──\033[0m\n' "$name"
  while IFS= read -r utter; do
    [ -z "$utter" ] && continue
    local out status
    out="$("$SCRIPT_DIR/test-interpret.sh" "$utter" 2>&1)" && status=$? || status=$?
    local body; body="$(printf '%s' "$out" | tail -1)"
    local spoken; spoken="$(printf '%s' "$body" | python3 -c 'import sys,json
try: print(json.loads(sys.stdin.read()).get("spoken","<no spoken>"))
except: print("<unparseable>")' 2>/dev/null || echo "<error>")"
    if [ $status -ne 0 ] || ! printf '%s' "$body" | grep -q '"status":"done"\|"status":"async"'; then
      printf '  %s \033[1;31m✗\033[0m %-55s → %s\n' "$(ts)" "\"$utter\"" "$spoken"
      FAIL=$((FAIL+1)); FAILED_LIST+=("$utter")
    else
      printf '  %s \033[1;32m✓\033[0m %-55s → %s\n' "$(ts)" "\"$utter\"" "$spoken"
      PASS=$((PASS+1))
    fi
    sleep 0.3
  done <<< "$lines"
}

printf 'Target: %s\n' "$URL"

for s in "${SUITES[@]}"; do
  case "$s" in
    state)      run_suite STATE       "$STATE"      ;;
    lights)     run_suite LIGHTS      "$LIGHTS"     ;;
    climate)    run_suite CLIMATE     "$CLIMATE"    ;;
    skylights)  run_suite SKYLIGHTS   "$SKYLIGHTS"  ;;
    av)         run_suite AV          "$AV"         ;;
    music)      run_suite MUSIC       "$MUSIC"      ;;
    scenes)     run_suite SCENES      "$SCENES"     ;;
    scheduling) run_suite SCHEDULING  "$SCHEDULING" ;;
    *)          printf '  unknown suite: %s\n' "$s" ;;
  esac
done

printf '\n\033[1m── summary ──\033[0m\n'
printf '  passed: \033[1;32m%d\033[0m   failed: \033[1;31m%d\033[0m\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '\n  failed utterances (re-run individually with test-interpret.sh):\n'
  for u in "${FAILED_LIST[@]}"; do printf '    %s\n' "$u"; done
  exit 1
fi
