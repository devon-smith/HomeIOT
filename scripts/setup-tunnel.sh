#!/usr/bin/env bash
#
# setup-tunnel.sh — stand up a Cloudflare Tunnel that exposes ONLY the
# brain's /interpret endpoint to Alexa (and later iOS), with no inbound
# port-forwarding on the router. Idempotent: safe to re-run.
#
# Run this ON THE MAC MINI (it needs a browser for the one-time login).
#
# Usage:
#   scripts/setup-tunnel.sh                          # natashabrain.com / home.natashabrain.com
#   scripts/setup-tunnel.sh natashabrain.com         # custom hostname defaults to home.<domain>
#   scripts/setup-tunnel.sh natashabrain.com api.natashabrain.com
#
# Env flags:
#   INSTALL_SERVICE=1   install + start the always-on launchd service at the end
#
set -euo pipefail

DOMAIN="${1:-natashabrain.com}"
HOSTNAME_FQDN="${2:-home.$DOMAIN}"
TUNNEL_NAME="home-brain"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
CF_DIR="$HOME/.cloudflared"

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }

# --- port from .env (default 3000) ---
PORT=3000
if [ -f "$ENV_FILE" ]; then
  p="$(grep -E '^PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d ' ')" || true
  [ -n "${p:-}" ] && PORT="$p"
fi

# --- 0. cloudflared present? ---
if ! command -v cloudflared >/dev/null 2>&1; then
  say "Installing cloudflared via Homebrew…"
  brew install cloudflared
fi
say "cloudflared $(cloudflared --version 2>/dev/null | head -1)"

# --- 1. auth (one-time, opens a browser) ---
if [ ! -f "$CF_DIR/cert.pem" ]; then
  say "Authenticating cloudflared — a browser opens. Pick $DOMAIN, then Authorize."
  cloudflared tunnel login
else
  say "Already authenticated ($CF_DIR/cert.pem present)."
fi

# --- 2. create tunnel (idempotent) ---
get_uuid() { cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" 'NR>1 && $2==n {print $1; exit}'; }
UUID="$(get_uuid || true)"
if [ -z "${UUID:-}" ]; then
  say "Creating tunnel '$TUNNEL_NAME'…"
  cloudflared tunnel create "$TUNNEL_NAME"
  UUID="$(get_uuid || true)"
fi
[ -n "${UUID:-}" ] || { warn "Could not determine tunnel UUID. Run: cloudflared tunnel list"; exit 1; }
say "Tunnel UUID: $UUID"

# --- 3. credentials file ---
CREDS="$CF_DIR/$UUID.json"
if [ ! -f "$CREDS" ]; then
  CREDS="$(ls "$CF_DIR"/*.json 2>/dev/null | head -1 || true)"
fi
[ -n "${CREDS:-}" ] && [ -f "$CREDS" ] || { warn "Credentials file not found in $CF_DIR"; exit 1; }

# --- 4. route DNS (idempotent) ---
say "Routing DNS $HOSTNAME_FQDN → tunnel…"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME_FQDN" 2>/dev/null \
  || warn "DNS route may already exist — continuing."

# --- 5. write ingress config ---
CONFIG="$CF_DIR/config.yml"
say "Writing $CONFIG"
cat > "$CONFIG" <<YAML
tunnel: $UUID
credentials-file: $CREDS

ingress:
  # Voice surface (Alexa / Siri) — the ONLY path exposed.
  - hostname: $HOSTNAME_FQDN
    path: "^/interpret/?\$"
    service: http://localhost:$PORT

  # Future: iOS app API (JWT-gated). Uncomment when P1b–P6 land.
  # - hostname: $HOSTNAME_FQDN
  #   path: "^/api/"
  #   service: http://localhost:$PORT

  # Everything else is refused at the edge — never reaches the brain.
  - service: http_status:404
YAML

# --- 6. ensure HB_HMAC_SECRET in .env ---
SECRET=""
if [ -f "$ENV_FILE" ]; then
  cur="$(grep -E '^HB_HMAC_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d ' ')" || true
  if [ -z "${cur:-}" ]; then
    SECRET="$(openssl rand -hex 32)"
    if grep -q '^HB_HMAC_SECRET=' "$ENV_FILE"; then
      awk -v v="$SECRET" 'BEGIN{FS=OFS="="} /^HB_HMAC_SECRET=/{print "HB_HMAC_SECRET="v; next} {print}' \
        "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    else
      printf 'HB_HMAC_SECRET=%s\n' "$SECRET" >> "$ENV_FILE"
    fi
    warn "Generated HB_HMAC_SECRET in .env — RESTART the brain for it to take effect."
  else
    SECRET="$cur"
  fi
fi

say "Setup complete."
cat <<INFO

  Hostname : https://$HOSTNAME_FQDN/interpret
  Brain    : http://localhost:$PORT
  Config   : $CONFIG
  Secret   : ${SECRET:-<set HB_HMAC_SECRET in .env, then re-run>}

── Test it ──────────────────────────────────────────────
  cloudflared tunnel run $TUNNEL_NAME &
  curl -i https://$HOSTNAME_FQDN/healthz       # expect 404 (only /interpret is open)

  TS=\$(date +%s000); REQ="t-\$(uuidgen)"; TEXT="turn off the kitchen lights"
  SIG=\$(printf "%s" "\$TS.\$REQ.\$TEXT" | openssl dgst -sha256 -hmac "${SECRET:-YOUR_SECRET}" -hex | awk '{print \$NF}')
  curl -s -X POST https://$HOSTNAME_FQDN/interpret \\
    -H "Content-Type: application/json" -H "X-HB-Timestamp: \$TS" -H "X-HB-Signature: \$SIG" \\
    -d "{\"text\":\"\$TEXT\",\"source\":\"alexa\",\"requestId\":\"\$REQ\"}"
  # expect: {"spoken":"...","status":"done"}
─────────────────────────────────────────────────────────
INFO

if [ "${INSTALL_SERVICE:-0}" = "1" ]; then
  say "Installing launchd service (sudo)…"
  sudo cloudflared service install
  sudo launchctl start com.cloudflare.cloudflared || true
  say "Service installed. Verify: sudo launchctl list | grep cloudflared"
else
  cat <<'SVC'
To run the tunnel always-on (survives reboot):

  sudo cloudflared service install
  sudo launchctl start com.cloudflare.cloudflared
  sudo launchctl list | grep cloudflared       # PID column = running

Or re-run this script with INSTALL_SERVICE=1 to do it now.
SVC
fi
