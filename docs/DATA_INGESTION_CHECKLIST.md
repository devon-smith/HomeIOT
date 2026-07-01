# Data ingestion checklist

Everything you need to gather, generate, or extract to take Home Brain from
sandbox mocks → talking to your real house. Organized by system; bring them
up in the order below so each subsequent step has its prerequisites.

Estimated time end-to-end: **half a day** if you have all credentials on
hand. The Control4 dealer coordination is the only item that may take a
week of calendar lag — start that first.

---

## 0 · Prereqs (15 min) — must happen first

| Item | What to collect | Where to find it | Where it goes |
|---|---|---|---|
| Anthropic API key | `sk-ant-...` | https://console.anthropic.com → API Keys → Create | `.env` → `ANTHROPIC_API_KEY=...` |
| Mac mini local IP | Static or DHCP-reserved IPv4 on the LAN | macOS → System Settings → Network → Wi-Fi/Ethernet | Used by every adapter that needs LAN access; configure DHCP reservation on the router |
| Repo + Docker | `git clone` of this repo on the Mac mini | — | `cd HomeIOT && docker compose up -d` (brings up Mosquitto, Postgres, Redis) |
| Node 20+ + pnpm | — | `brew install node@22 pnpm` | — |
| Python 3.10+ + pip | — | macOS ships 3.11; `brew install python@3.12` if needed | — |

- [ ] Anthropic key generated and dropped in `.env`
- [ ] Mac mini IP reserved on router
- [ ] `docker compose up -d` runs cleanly (`mqtt://localhost:1883`, `postgres://localhost:5434`, `redis://localhost:6379` all responsive)
- [ ] `pnpm install && pnpm prisma migrate dev` succeeds
- [ ] `pnpm dev` starts and `curl http://localhost:3000/healthz` returns `{brain: "ok", postgres: "ok"}`

---

## 1 · House layout (30 min) — the source-of-truth doc

Before any adapter, fill out `config/house.yaml` (copy from
`config/house.example.yaml`). Every adapter reads this file at startup.

For each **room** you want under Home Brain's control:

| Field | Notes |
|---|---|
| `label` | Display name (e.g. "Living Room"); used in the dashboard and natural-language responses |
| `devices.*.adapter` | One of: `sonos`, `control4`, `iaqualink`, `tuya`, `tv` |
| `devices.*.config` | Adapter-specific config — see each adapter section below |

For each **actor** (owner / partner / future guests):

| Field | Notes |
|---|---|
| `role` | `owner` / `partner` / `guest` |
| `imessage_handles` | All phone numbers + Apple IDs they use to message you. Phone numbers in any format (normalized at runtime); emails any case |

For **zones** (cross-room logical groupings):

| Example | Maps to |
|---|---|
| `outdoor: [backyard]` | LLM target like "turn off outdoor lights" |
| `downstairs: [living_room, kitchen, theater]` | "music everywhere downstairs" |

- [ ] `config/house.yaml` copied from example and edited
- [ ] Every room labeled
- [ ] Every controllable device declared with `adapter:` and a placeholder `config:`
- [ ] Owner actor's handles filled in (used by iMessage bridge)
- [ ] Zones declared

---

## 2 · Sonos (15 min) — M1

| Item | What to collect | Where to find it | Where it goes |
|---|---|---|---|
| Per-room zone names | The exact Sonos zone name as it appears in the Sonos app | Sonos app → Settings → System → list of rooms | `house.yaml` → `rooms.{room}.devices.music.config.sonos_zone: "Living Room"` |
| Sonos library | Already on your network | — | Discovery happens automatically once the adapter runs |
| `sonos` npm package | Replace the `RealSonosBackend` stub | `pnpm add sonos` | `src/adapters/sonos/sonos-backend.ts` — implement against `AsyncDeviceDiscovery` and the device API |

Zone names must match **exactly** including capitalization — "Living Room"
not "living room" or "livingroom".

- [ ] Every Sonos room's `sonos_zone` filled in
- [ ] `pnpm add sonos`
- [ ] `RealSonosBackend` implemented (see comments in the stub file)
- [ ] `SONOS_MODE=real pnpm sonos` runs without errors and publishes
      initial state for each zone

---

## 3 · Control4 (1 day; 1 week of calendar lag) — M2

**Calendar lag is the dealer.** Email them today; everything else can
proceed in parallel.

### From the dealer

| Item | Why | How to ask |
|---|---|---|
| Director controller IP | Where the C4 system lives on the LAN | "What's the IP of my Control4 Director controller?" |
| Account email + password for API access | `pyControl4` authenticates as an account | Same account you use for the C4 mobile app — or ask for a dedicated API account |
| Named scenes catalog | Brain-callable scene names | "Please expose named scenes for the actions I want to call: `theater_movie`, `kitchen_dinner`, `all_off`, etc. The scenes themselves can be anything you've already programmed — I just need stable names I can invoke" |
| Per-zone proxy IDs for lights | `pyControl4` addresses lights by proxy ID | Dealer can pull from Composer; one number per light zone |

### From you

| Item | Where to find it | Where it goes |
|---|---|---|
| C4 firmware version | Composer Pro / C4 mobile app → About | Note in `docs/HA_DECISION.md` decision log; pin to it to avoid surprise updates |
| Per-room `c4_proxy_id` | From dealer | `house.yaml` → `rooms.{room}.devices.lights.config.c4_proxy_id` |
| Brain-owned scene compositions | Decide based on your routines | `config/scenes.yaml` (copy from `scenes.example.yaml`) — each scene is a list of tool-call steps; one may be `run_c4_scene` |
| `pyControl4` install | `pip install pyControl4` in `adapters-py/control4/` | Uncomment in `adapters-py/control4/pyproject.toml` and implement `pycontrol4_backend.py` |

- [ ] Email sent to dealer with the four asks
- [ ] Director IP recorded
- [ ] API account credentials in `.env`: `CONTROL4_HOST`, `CONTROL4_EMAIL`, `CONTROL4_PASSWORD`
- [ ] Per-room `c4_proxy_id`s filled in `house.yaml`
- [ ] `config/scenes.yaml` populated with at least 3 brain compositions
      (movie_night, dinner, evening_outdoor or similar)
- [ ] `PyControl4Backend` implemented (see stub comments)
- [ ] `CONTROL4_MODE=real python -m home_brain_control4.main` runs without
      errors and publishes initial lighting state per room

---

## 4 · iAquaLink (15 min) — M3

| Item | What to collect | Where to find it | Where it goes |
|---|---|---|---|
| Jandy/Zodiac account email + password | The same login you use for the iAquaLink mobile app | iAquaLink app | `.env` → `IAQUALINK_EMAIL`, `IAQUALINK_PASSWORD` |
| System names | "spa" + "pool" or whatever your installer named them | iAquaLink app → device list (verbatim) | `house.yaml` → `rooms.backyard.devices.{hot_tub,pool}.config.system` |
| `iaqualink` package | `pip install iaqualink` in `adapters-py/iaqualink/` | — | Uncomment in pyproject.toml |

- [ ] Email + password in `.env`
- [ ] System names verified against the app
- [ ] `IAquaLinkBackend` implemented against the library
- [ ] `IAQUALINK_MODE=real python -m home_brain_iaqualink.main` runs
      without errors and shows current temperatures for hot_tub + pool

---

## 5 · Tuya / Smart Life (1 hour) — M3

The setup is fiddler. Block off an hour the first time.

### One-time: Tuya IoT Cloud project

1. Create a free account at https://iot.tuya.com
2. Cloud → Development → Create Cloud Project
3. Select region matching your devices
4. Note the **Access ID** and **Access Secret**
5. Add devices: project → Devices → Link Tuya App Account → scan QR with
   Smart Life app. This pairs your Smart Life account into the cloud
   project so `tinytuya wizard` can list devices.

### Extract per-device credentials

```sh
pip install tinytuya
python -m tinytuya wizard
```

Walks you through the Cloud creds and outputs:

| Item | What it is | Where it goes |
|---|---|---|
| `device_id` | 20-character device identifier | `house.yaml` → `rooms.{room}.devices.{slug}.config.device_id` |
| `local_key` | 16-character per-device key, stable until factory reset | `house.yaml` → `rooms.{room}.devices.{slug}.config.local_key` |
| `ip` (optional) | Device IP — auto-detected via UDP broadcast | Not needed unless your LAN blocks the broadcast |

### Per-device `kind`

Declare what each Tuya device is:

| Device slug | `config.kind` | Notes |
|---|---|---|
| `sauna`, `hot_tub`, `pool`, `hvac_main` | `climate` | Supports `set_target` / `set_mode`, publishes `{mode, target_f, current_f, heating}` |
| `fountain`, `pool_jets`, any switch | `switch` | On/off only, publishes `{on}` |

If you omit `kind`, the adapter infers it (climate for known slugs, switch
for everything else).

### Network

| Port/Protocol | Direction | Why |
|---|---|---|
| UDP 6666 | inbound | Device announcements |
| UDP 6667 | inbound | Encrypted device announcements |
| UDP 7000 | inbound | Newer firmware announcements |
| TCP 6668 | outbound | Command channel |

Most home routers pass these freely; check if you have device isolation
("AP isolation" or "guest network") enabled — it'll block these.

### Code

- `pip install tinytuya` in `adapters-py/tuya/`
- Uncomment in `pyproject.toml`
- Implement `TinyTuyaBackend` — DP map is sauna-model-specific, use
  `device.detect_available_dps()` to discover DP IDs

### Checklist

- [ ] Tuya IoT Cloud project created, Access ID + Secret saved
- [ ] `tinytuya wizard` ran successfully, outputs in hand
- [ ] Every Tuya device's `device_id` + `local_key` in `house.yaml`
- [ ] Per-device `kind` set or inferred correctly
- [ ] Router not blocking UDP 6666/6667/7000 or TCP 6668
- [ ] `TinyTuyaBackend` implemented
- [ ] `TUYA_MODE=real python -m home_brain_tuya.main` runs without
      errors and shows initial state for every device
- [ ] **Document the recovery procedure** in `docs/` — what to do when a
      factory reset rotates a `local_key` (re-run wizard, update yaml)

---

## 6 · TVs (1 hour per brand) — M4

Per brand. Skip the brands you don't have.

### Common

| Item | Where to find it | Where it goes |
|---|---|---|
| Per-TV brand | obvious | `house.yaml` → `rooms.{room}.devices.tv.config.brand` (one of `samsung`, `lg`, `sony`, `apple_tv`) |
| Per-TV LAN IP | Router DHCP table; reserve it | `house.yaml` → `rooms.{room}.devices.tv.config.ip` |

### Samsung Tizen

| Item | Where to find it | Where it goes |
|---|---|---|
| Pairing token | Generated on first pair (TV prompts you to allow the connection) | Cache to `~/.home-brain/samsung-tokens/{room}.json` (write to disk in `SamsungTVBackend.init`) |
| `samsung-tv-control` npm package | `pnpm add samsung-tv-control` | `src/adapters/tv/brand-backends.ts` |

### LG webOS

| Item | Where to find it | Where it goes |
|---|---|---|
| Client key | Issued on first connection (TV prompts to allow) | Cache to `~/.home-brain/lg-keys/{room}.json` |
| `lgtv2` npm package | `pnpm add lgtv2` | `src/adapters/tv/brand-backends.ts` |

### Sony Bravia

| Item | Where to find it | Where it goes |
|---|---|---|
| Pre-Shared Key (PSK) | TV → Settings → Network → Home Network → IP Control → Authentication → Pre-Shared Key | `house.yaml` → `rooms.{room}.devices.tv.config.psk` |
| (No npm package) | Direct HTTP — `fetch` is enough | — |

### Apple TV (recommended: separate Python adapter)

`pyatv` is Python-only. Two paths:

**Recommended:** add a new `adapters-py/apple_tv/` mirroring `iaqualink/`,
remove `apple_tv` from the TS TV adapter's brand list. One process per
language family stays cleaner than shelling out.

**Pragmatic shortcut:** keep the TV adapter as the dispatch process and
shell out to `atvremote` (pyatv's CLI) from the AppleTV backend. Adds a
~50ms per-command overhead from process startup.

Either way:

| Item | Where to find it | Where it goes |
|---|---|---|
| Apple TV credentials | Pair via `atvremote --id <id> --protocol airplay pair` | Cache the credentials blob to `~/.home-brain/apple-tv/{room}.creds` |

### Checklist

- [ ] Every TV's IP reserved on router
- [ ] Per-brand library installed
- [ ] Per-brand backend implemented (Samsung, LG, Sony, or Apple TV)
- [ ] Pairing complete for each TV (token / client-key / PSK saved)
- [ ] `TV_MODE=real pnpm tv` runs without errors and reports state for
      every TV

---

## 7 · iMessage bridge (15 min, macOS-only) — M5

Per `docs/IMESSAGE_BRIDGE.md`. The brief version:

### Permissions to grant

| Where | What |
|---|---|
| System Settings → Privacy & Security → Full Disk Access | `/opt/node22/bin/node` (or your `node` binary) |
| Same | `/usr/bin/sqlite3` |
| Settings → Privacy & Security → Automation → osascript | Allow control of Messages.app |

### Config

| Item | Where to find it | Where it goes |
|---|---|---|
| Every actor's iMessage handles | Phone numbers + Apple IDs | `house.yaml` → `actors.{slug}.imessage_handles[]` |

### Install

| Step | Where |
|---|---|
| Copy plist | `cp scripts/com.homebrain.imessage.plist ~/Library/LaunchAgents/` |
| Edit `WorkingDirectory` + log paths | Open the copied plist |
| Load | `launchctl load ~/Library/LaunchAgents/com.homebrain.imessage.plist` |
| Verify | `tail -f ~/Library/Logs/home-brain-imessage.log` then text yourself |

### Checklist

- [ ] FDA granted to node + sqlite3
- [ ] Automation → Messages granted to osascript
- [ ] Every actor's handles in `house.yaml`
- [ ] plist copied, edited, loaded
- [ ] Sending a text from another device produces a brain reply

---

## 8 · Web dashboard (already shipped) — M5

The dashboard at `http://<mac-mini>:3000/` ships with the brain — no
extra setup. To make it reachable from other devices on the LAN:

| Item | Where |
|---|---|
| Local hostname | macOS sets one automatically (`mac-mini.local`) — no DNS work needed |
| Tailscale | See §11 below (no longer deferred to M10 — being set up alongside an unrelated project) |

- [ ] Confirm `http://<mac-mini>.local:3000/` loads from your phone on
      the same Wi-Fi

---

## 9 · BullMQ-backed scheduler (1 hour) — M3 durability

The sandbox uses `MemoryScheduler` (lost on restart). For reboot-safe
scheduling:

| Item | Where it goes |
|---|---|
| Implement `BullMQScheduler` against the BullMQ Redis-backed queue and the existing Prisma `scheduled_jobs` table | `src/core/scheduler.ts` (replace the stub class) |
| Swap in `server.ts` | `new BullMQScheduler(exec, config.REDIS_URL, config.DATABASE_URL)` instead of `MemoryScheduler` |

Reads pending jobs from Postgres on startup; the queue itself lives in
Redis.

- [ ] `BullMQScheduler` implemented
- [ ] Schedule a future job, kill the brain process, restart it, confirm
      the job still fires

---

## 10 · Tailscale (30 min, arriving early)

> Originally part of M10, but Tailscale is being set up on the Mac mini
> ahead of schedule alongside an unrelated project. **The tailnet is owned
> by the home manager** — the items marked "(tailnet owner)" below are
> asks for him; everything else you do yourself.

### Roles

Two access levels, least-privilege:

| Tag | Who | Can reach on the Mac mini |
|---|---|---|
| `tag:homebrain-admin` | Your dev machines (desktop, laptop) | ports 22 (SSH) + 3000 (dashboard) |
| `tag:homebrain-users` | Your phone, partner's phone | port 3000 only |

The son's existing port-22 rule is separate and stays as-is.

### Asks for the tailnet owner

1. **Fresh user invite** for your email (invite links expire — Admin
   console → Users → Invite user). One invite covers all your devices.
2. **Tag the Mac mini** `tag:homebrain-server` (Admin console → Machines
   → opens-mac-mini → Edit ACL tags).
3. **After your devices join**, tag your desktop/laptop
   `tag:homebrain-admin` and your phone `tag:homebrain-users`.
4. **Apply the ACL snippet** below (Admin console → Access controls) —
   it extends, not replaces, the existing policy.
5. **Confirm MagicDNS is on** (DNS tab) so `opens-mac-mini` resolves by
   name.
6. **Keep subnet routes off** for the Mac mini (already his plan).

### Recommended ACL snippet

```jsonc
{
  "tagOwners": {
    "tag:homebrain-server": ["tailnet-owner@example.com"],
    "tag:homebrain-admin":  ["tailnet-owner@example.com"],
    "tag:homebrain-users":  ["tailnet-owner@example.com"]
  },
  "acls": [
    // Existing son's rule stays as-is — port 22 only to the Mac mini.

    // Dev machines: SSH + dashboard.
    {
      "action": "accept",
      "src":    ["tag:homebrain-admin"],
      "dst":    ["tag:homebrain-server:22,3000"]
    },
    // Phones: dashboard only.
    {
      "action": "accept",
      "src":    ["tag:homebrain-users"],
      "dst":    ["tag:homebrain-server:3000"]
    }
  ]
}
```

### Your own steps (after the invite arrives)

1. Install Tailscale on the desktop (`brew install --cask tailscale` or
   tailscale.com/download) and on your phone (iOS app).
2. Sign in via the invite — your own account, never the owner's login.
3. Verify: `tailscale status` shows opens-mac-mini; then
   `ssh openclaw@opens-mac-mini` and `http://opens-mac-mini:3000/` work
   from anywhere.

### While at home (no Tailscale needed)

The Mac mini is reachable over the LAN via mDNS regardless of tailnet
state: `ssh openclaw@opens-mac-mini.local` and
`http://opens-mac-mini.local:3000/`. Use this path for everything until
the invite/tagging lands. Also do `ssh-copy-id openclaw@opens-mac-mini.local`
now so key-based SSH works before you leave the LAN.

### Verify

- [ ] `http://opens-mac-mini:3000/` loads on your phone **on cellular**
- [ ] `ssh openclaw@opens-mac-mini` works from your desktop off-LAN
- [ ] **Son's device cannot reach port 3000** — have him try; ACLs are
      easy to get subtly wrong
- [ ] Partner invited + phone tagged `tag:homebrain-users` (if applicable)

### Checklist

- [ ] Mac mini on Tailscale and tagged `tag:homebrain-server`
- [ ] Your phone tagged `tag:homebrain-users`
- [ ] ACL snippet applied (extends existing son's rule)
- [ ] `http://openclaw-mac-mini:3000/` loads on your phone from cellular
- [ ] Partner invited + tagged (if they're a brain user)
- [ ] **Verify the son cannot reach port 3000** — log in on his
      computer (or have him try) and confirm `http://openclaw-mac-mini:3000/`
      times out. ACLs are easy to get subtly wrong.

---

## 11 · Pre-flight checklist before going live

Run this list once everything above is filled in, before letting the
brain talk to your house unsupervised:

- [ ] `pnpm test` — 37+ unit tests pass
- [ ] `pnpm smoke` — 31+ smoke assertions pass
- [ ] `docker compose ps` shows all 3 services healthy
- [ ] `pnpm dev` starts cleanly; `/healthz` returns ok for brain +
      postgres + planner
- [ ] Each adapter started in `*_MODE=real` mode publishes initial state
      under its devices
- [ ] `curl -X POST http://localhost:3000/message -H 'content-type:
      application/json' -d '{"text":"pause music in the living room"}'`
      actually pauses the music (and you hear it pause from the room)
- [ ] Dashboard at `http://localhost:3000/` shows live world state and
      receives the most recent commands
- [ ] iMessage from your owner phone produces a response in the
      conversation
- [ ] Schedule something 60 seconds out via the dashboard or `/message`;
      reboot the brain process; confirm it still fires

---

## Quick-reference: where every secret lives

| Secret | File / location |
|---|---|
| `ANTHROPIC_API_KEY` | `.env` |
| `DATABASE_URL` | `.env` (matches `docker-compose.yml` defaults out of the box) |
| `REDIS_URL` | `.env` |
| `MQTT_URL` | `.env` |
| Control4 controller + account creds | `.env` (`CONTROL4_HOST`, `CONTROL4_EMAIL`, `CONTROL4_PASSWORD`) |
| iAquaLink account creds | `.env` (`IAQUALINK_EMAIL`, `IAQUALINK_PASSWORD`) |
| Tuya per-device IDs + keys | `config/house.yaml` per device `config:` block |
| Sony Bravia PSK | `config/house.yaml` per TV `config.psk` |
| Samsung pairing tokens | `~/.home-brain/samsung-tokens/{room}.json` (auto-cached on first pair) |
| LG client-keys | `~/.home-brain/lg-keys/{room}.json` (auto-cached on first pair) |
| Apple TV creds | `~/.home-brain/apple-tv/{room}.creds` (from `atvremote pair`) |
| iMessage handles → actor mapping | `config/house.yaml` → `actors.{slug}.imessage_handles[]` |
| iMessage cursor | `~/.home-brain/imessage-cursor` (auto-managed) |

`.env` is gitignored; `~/.home-brain/` is outside the repo entirely.
`config/house.yaml` is gitignored (only the `.example.yaml` is checked
in). All real secrets stay off git.
