# Cloudflare Tunnel — exposing the brain to Alexa (and later iOS)

The brain runs on the Mac mini behind your home NAT. To let Alexa (running
in AWS) and a future iOS app (running anywhere) reach `/interpret` and
the upcoming JWT-gated `/api/*` endpoints, we use **Cloudflare Tunnel**:
a free service where a small daemon (`cloudflared`) on the mini holds an
outbound TLS connection to Cloudflare, and Cloudflare publishes one
hostname (`home.natashabrain.com`) that forwards requests through that
tunnel.

**Domain:** `natashabrain.com` (registered ✓) · **Hostname:** `home.natashabrain.com`

**Properties:**
- No inbound port forwarding on your router (the connection is outbound from the mini)
- TLS terminated at Cloudflare's edge (automatic cert)
- Only one path (`/interpret`) is exposed; everything else 404s at the tunnel
- Optional **Cloudflare Access** service token in front for an extra gate
- Free tier covers personal use; ~unlimited bandwidth at this scale

---

## Fast path — one script (recommended)

On the **Mac mini** (it needs a browser for the one-time login):

```bash
cd ~/code/HomeIOT
git pull
scripts/setup-tunnel.sh                 # uses natashabrain.com / home.natashabrain.com
```

The script is idempotent and does steps 2–6 below automatically: installs
`cloudflared`, logs in, creates the `home-brain` tunnel, routes DNS, writes
`~/.cloudflared/config.yml`, and generates `HB_HMAC_SECRET` into `.env` if
it's still blank (printing it so you can paste the same value into the Alexa
Lambda). It then prints copy-paste test commands.

Install it as an always-on service in the same run:

```bash
INSTALL_SERVICE=1 scripts/setup-tunnel.sh
```

Want a different subdomain? `scripts/setup-tunnel.sh natashabrain.com brain.natashabrain.com`.

The manual steps below are the fallback / reference if you'd rather do it by hand.

---

## Manual setup

### Step 1 — Register a domain at Cloudflare (~$10/yr) — ✓ done

`natashabrain.com` is registered on Cloudflare Registrar, so DNS + tunnel
live in one place. Nothing more to do here.

### Step 2 — Install cloudflared on the mini

```bash
brew install cloudflared
cloudflared --version    # confirm install
```

### Step 3 — Authenticate cloudflared

```bash
cloudflared tunnel login
```

This opens a browser → log into Cloudflare → pick `natashabrain.com` → click
Authorize. cloudflared saves `cert.pem` to `~/.cloudflared/`.

### Step 4 — Create the tunnel

```bash
cloudflared tunnel create home-brain
```

Returns:
```
Tunnel credentials written to ~/.cloudflared/<UUID>.json.
Created tunnel home-brain with id <UUID>
```

Note the **UUID** — you'll reference it next.

### Step 5 — Route DNS

```bash
cloudflared tunnel route dns home-brain home.natashabrain.com
```

This creates a CNAME on your Cloudflare DNS pointing the hostname at the
tunnel. Wait a minute for propagation.

### Step 6 — Configure ingress

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <UUID-from-step-4>
credentials-file: /Users/<you>/.cloudflared/<UUID>.json

ingress:
  # Voice surface (Alexa / Siri) — the ONLY path exposed.
  - hostname: home.natashabrain.com
    path: "^/interpret/?$"
    service: http://localhost:3000

  # Future: iOS app API (JWT-gated). Uncomment when P1b–P6 land.
  # - hostname: home.natashabrain.com
  #   path: "^/api/"
  #   service: http://localhost:3000

  # Catch-all: refuse everything else at the tunnel — never reaches the brain.
  - service: http_status:404
```

### Step 7 — Test the tunnel manually

```bash
cloudflared tunnel run home-brain
# leave running in a terminal

# in another terminal, on any machine:
curl -i https://home.natashabrain.com/healthz
# expect: 404 (path not in ingress list — exactly what we want)

# Now an authenticated /interpret call:
SECRET=<the-HB_HMAC_SECRET-from-.env>
TS=$(date +%s000)
REQ="test-$(uuidgen)"
TEXT="turn off the kitchen lights"
SIG=$(printf "%s" "$TS.$REQ.$TEXT" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
curl -X POST https://home.natashabrain.com/interpret \
  -H "Content-Type: application/json" \
  -H "X-HB-Timestamp: $TS" \
  -H "X-HB-Signature: $SIG" \
  -d "{\"text\":\"$TEXT\",\"source\":\"alexa\",\"requestId\":\"$REQ\"}"
# expect: {"spoken":"...","status":"done"}
```

If both work, kill the foreground tunnel (Ctrl-C) and install as a service.

### Step 8 — Run cloudflared as a launchd service (always on)

```bash
sudo cloudflared service install
# launchd plist installed at /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
sudo launchctl start com.cloudflare.cloudflared
sudo launchctl list | grep cloudflared    # confirm 'PID' column has a number
```

The tunnel now survives reboots and runs alongside the brain.

## Optional — Cloudflare Access service token (extra gate)

This adds a second auth layer in front of HMAC: requests without the
service token are bounced by Cloudflare before they ever reach the mini.

1. https://one.dash.cloudflare.com → **Access → Applications → Add an application → Self-hosted.**
2. Application name: `Home Brain`. Domain: `home.natashabrain.com`,
   path: `/interpret`.
3. Add a policy:
   - Action: **Service Auth** (not "Allow" or "Block").
   - Rule: **Service Token** is *one of* **(name)**.
4. **Service Auth → Service Tokens → Create**: name `home-brain-alexa`.
   Save the **Client ID** and **Client Secret** — they're shown once.
5. Set the same two values as `CF_ACCESS_CLIENT_ID` and
   `CF_ACCESS_CLIENT_SECRET` in the Alexa Lambda's env vars.
6. The Lambda's `callBrain()` already attaches them (`CF-Access-Client-Id`,
   `CF-Access-Client-Secret`).

Now random internet scanners get a 403 from Cloudflare before the brain
even sees the request. Only the Lambda (with the tokens baked in) can
reach `/interpret`.

## Monitoring

```bash
# tail the tunnel daemon logs
sudo log show --predicate 'process == "cloudflared"' --info --last 5m

# tunnel status
cloudflared tunnel info home-brain
```

## Costs

| Item | Cost |
|---|---|
| Cloudflare account | Free |
| Cloudflare Tunnel | Free |
| Cloudflare Access (service tokens) | Free up to 50 users |
| Cloudflare DNS | Free |
| **Domain registration** (`natashabrain.com`) | ~$10/yr |
| Alexa-hosted Lambda | Free |

Total ongoing: **~$10/yr** for the domain.
