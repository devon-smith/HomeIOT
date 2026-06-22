# Home Brain — Project Scope & Handoff

> **Purpose of this doc:** the single context-priming document for any new
> conversation or contributor on this project. Read this first; it tells you
> what exists, what state it's in, how to work on it, and what's next.
> Last updated: 2026-06-22.

---

## 0 · Resume work in one command

From your **local machine**:

```
ssh openclaw@opens-mac-mini
~/code/HomeIOT/scripts/resume.sh
```

`resume.sh` pulls the latest code, restarts the brain with the real
backends live (**Sonos + iAquaLink**; C4/Tuya/TV stay mock), and drops you
into the tmux session. Detach with `Ctrl-b` then `d`; the brain keeps
running. Dashboard: `http://opens-mac-mini:3000/`.

- Just want to look, not restart? `ssh openclaw@opens-mac-mini -t 'tmux attach -t brain'`
- Reboots autostart the system **in real mode** now (via the launchd agent),
  so you only need `resume.sh` when you want the latest code or a clean restart.

---

## 1 · What this project is

**Home Brain** is a local-first, natural-language home control system for a
single Bay Area smart home. The user types (or eventually speaks) commands —
"warm the hot tub for 9pm", "movie night in the theater", "pause music in
the living room" — and the system translates intent into coordinated device
actions across Control4, Sonos, iAquaLink (pool/spa), Tuya (sauna, switches),
and IP TVs.

**Core architectural bet:** the LLM (Claude) is a *planner over a clean
world model*, not a device driver. Each device family gets its own adapter
process that speaks the native protocol and publishes canonical state to an
MQTT bus. A regex fast-path handles trivial commands with zero LLM latency;
everything else escalates to a Claude tool-use planner.

**Runs on:** a Mac mini on the home LAN (hostname `opens-mac-mini` on the
Tailscale tailnet, local user `openclaw`).

### Canonical docs (read in this order)

| Doc | What it covers |
|---|---|
| `PROJECT_REPORT.md` | Strategy, goals, device landscape, build-vs-buy, phased plan |
| `ARCHITECTURE.md` | Five-layer design, data flows, MQTT contract, caching layout, scenes model |
| `ROADMAP.md` | Milestones M0–M12 with done-when criteria and dependency graph |
| `docs/MQTT_TOPICS.md` | The topic schema — the contract between orchestrator and adapters |
| `docs/TOOL_SCHEMA.md` | The tool interface Claude sees + permission matrix |
| `docs/ADAPTER_GUIDE.md` | How to write a new device adapter |
| `docs/DATA_INGESTION_CHECKLIST.md` | Every credential/config needed to go from mocks → real hardware |
| `docs/OPEN_QUESTIONS.md` | ~70 unanswered product decisions, tagged BLOCKING/IMPORTANT/FUTURE |
| `docs/HA_DECISION.md` | Why we deferred Home Assistant; trigger conditions to revisit |
| `docs/IMESSAGE_BRIDGE.md` | iMessage bridge install (launchd, Full Disk Access) |

---

## 2 · Current state (the honest version)

### Milestones shipped (all on branch `claude/admiring-planck-CwkwR`)

| Milestone | What shipped | Real or mock? |
|---|---|---|
| **M0 Foundation** | Docker stack (Mosquitto/Postgres/Redis), Prisma schema, TS skeleton, LAN discovery script | Real, deployed |
| **M1 Sonos** | Intent pipeline (normalize → fast-path classifier → Claude planner w/ prompt caching), Sonos adapter, `set_music`/`query_state` tools | **REAL** — controls all 11 live zones; `play` falls back Favorites → saved playlists |
| **M2 Control4 + scenes** | Python C4 adapter, scene engine (`config/scenes.yaml`), `run_scene`/`run_c4_scene`/`set_lights` tools | **Mock** — `PyControl4Backend` is a stub (self-service discovery script ready: `scripts/discover-control4.py`) |
| **M3 Pool/spa/sauna + scheduling** | Python iAquaLink + Tuya adapters, `set_climate`/`schedule_action` tools, `MemoryScheduler` | **iAquaLink REAL** (hot-tub heating confirmed end-to-end); Tuya still mock; scheduler in-memory (not reboot-durable) |
| **M4 TVs + long tail** | TS TV adapter (per-brand backends), `set_video`/`set_water_feature` tools, HA decision deferred | **Mock** — all 4 brand backends stubbed |
| **M5 Interfaces** | Web dashboard (vanilla JS, served at `/`), iMessage bridge (chat.db poll + osascript reply), launchd plist | Dashboard real & deployed; iMessage bridge untested on real macOS (needs FDA grants) |

### Test surface

- `pnpm typecheck` — clean
- `pnpm test` — **37 unit tests** (classifier, normalizer, scenes loader, scene engine, scheduler, schedule_action validation, iMessage pure logic)
- `pnpm smoke` — **36 assertions**, spins an in-process MQTT broker (aedes), spawns all 5 adapters in mock mode, verifies §A Sonos / §B C4 / §C scene engine / §D climate / §E scheduling / §F TV / §G water feature end-to-end

### Deployment state on the Mac mini (as of 2026-06-22)

- ✅ Repo cloned at `~/code/HomeIOT`, branch `claude/admiring-planck-CwkwR`
- ✅ `./scripts/setup-mac-mini.sh` passed all 7 steps (36 smoke assertions)
- ✅ Docker stack up (mosquitto/postgres/redis, bound to 127.0.0.1 only)
- ✅ Python venv at `.venv/` with all adapters installed
- ✅ Prisma migration `20260609224546_init` applied
- ✅ Tailscale on, device name `opens-mac-mini` (100.109.190.15); SSH from owner's desktop confirmed
- ✅ `ANTHROPIC_API_KEY` in `.env` — **LLM planner live**
- ✅ `config/house.yaml` deployed with 11 real Sonos zones + pool/spa systems (from live `pnpm discover`)
- ✅ **launchd autostart** for the brain — cold reboot brings the tmux session up automatically, now **in real mode** (`launchd-boot.sh` exports `SONOS_MODE=real IAQUALINK_MODE=real`)
- ✅ **Real Sonos** control across all 11 zones (jazz via Spotify confirmed playing)
- ✅ **Real iAquaLink** — "warm the hot tub to 102" confirmed against the live spa (heater turned on, verified in the Jandy app)
- ✅ Durable-feeling scheduling demoed (compound "off now + on at 11:35am" fired correctly) — but scheduler is still **in-memory**, so jobs are lost on reboot
- ⚠️ **Credential rotation owed** — iAquaLink password + an Anthropic key were exposed in a pasted screenshot; rotate both (see §8)
- ⚠️ Tailscale ACL for port 3000 (`tag:homebrain-server` / `tag:homebrain-users`) — apply/verify per `DATA_INGESTION_CHECKLIST.md §10`
- ⚠️ Master-bedroom Sonos ("Master") throws UPnP error 800 intermittently — device pings fine; likely stale grouping/subscription. Adapter-level retry resilience offered, not yet built.

### What is NOT real yet

Sonos and iAquaLink are live. The remaining real backends are deliberate,
clearly-marked stubs with implementation notes in each file:

| Stub | File | Library to use | Unblocked by |
|---|---|---|---|
| Control4 | `adapters-py/control4/home_brain_control4/pycontrol4_backend.py` | `pyControl4` | owner runs `scripts/discover-control4.py`, sends inventory JSON |
| Tuya | `adapters-py/tuya/home_brain_tuya/tinytuya_backend.py` | `tinytuya` | owner runs `tinytuya wizard`, sends `devices.json` |
| TVs (4 brands) | `src/adapters/tv/brand-backends.ts` | per-brand | per-brand network details |
| Durable scheduler | `src/core/scheduler.ts` (`BullMQScheduler` class) | BullMQ + Postgres | my side, ~30 min |

---

## 3 · How the system works (60-second version)

```
user text → POST /message
  → normalize → fast-path regex classifier
      → hit: direct MQTT command (~100ms)
      → miss: Claude planner (claude-sonnet-4-6, tool-use loop,
              prompt caching: persona + house def cached, world state fresh)
  → tools publish commands to home/{room}/{device}/command (with UUID)
  → adapter executes on native protocol, publishes state echo with _cmd_id
  → orchestrator's Bus.waitForCommand() resolves → user gets confirmation
```

- **State**: Redis = live world model; Postgres = history/scenes/jobs/audit (Prisma).
- **MQTT**: retained state topics rebuild the world after restarts. `home/_meta/adapter/{name}/health` heartbeats every 15s with LWT.
- **Scenes**: two kinds — C4-internal scenes stay in Composer (fired via `run_c4_scene`); cross-vendor compositions live in `config/scenes.yaml` (fired via `run_scene`, steps run in parallel).
- **Actors**: owner/partner/guest roles; yaml seeds the Postgres `actors` table; enforcement at tool-execution layer (post-LLM). iMessage sender → actor mapping in the bridge.

---

## 4 · Working conventions

- **Branch:** all work on `claude/admiring-planck-CwkwR` (never push elsewhere without permission).
- **Every adapter follows the same shape:** backend interface + mock backend (fully working) + real backend (stub w/ implementation notes) + MQTT main. Mock mode means the entire system is testable with zero hardware/credentials.
- **Mode env vars:** `SONOS_MODE` / `TV_MODE` / `CONTROL4_MODE` / `IAQUALINK_MODE` / `TUYA_MODE`, each `mock` (default) or `real`.
- **Verification gate for every change:** `pnpm typecheck` + `pnpm test` + `pnpm smoke` must all pass. The smoke is the no-hardware E2E proof; extend it when adding adapter capability.
- **Python:** project venv at `.venv/` (Homebrew Python is PEP 668-protected; never pip install system-wide). `run-all.sh` and `smoke.ts` both resolve `.venv/bin/python3` automatically.
- **pnpm 10:** build-script allowlist lives in `pnpm-workspace.yaml` (`onlyBuiltDependencies`).
- **Secrets:** `.env` (gitignored) for API keys; `config/house.yaml` (gitignored) for device credentials; `~/.home-brain/` for runtime-cached tokens. Only `.example` files are committed.
- **Ops scripts:** `./scripts/setup-mac-mini.sh` (idempotent bootstrap + verify), `./scripts/run-all.sh` (tmux session `brain`, 6 windows, per-adapter mode overrides).

---

## 5 · Immediate next steps (in priority order)

Three parallel tracks are open. The first two need owner-side data; the
third is mine.

1. **Track A — Control4 (self-service, no dealer):** add `CONTROL4_HOST`
   (Director IP) / `CONTROL4_EMAIL` / `CONTROL4_PASSWORD` to `.env`, then on
   the mini: `.venv/bin/pip install pyControl4 aiohttp` and
   `.venv/bin/python scripts/discover-control4.py > /tmp/c4-inventory.json`.
   Send the JSON → I build `RealPyControl4Backend`.
2. **Track B — Tuya (find the sauna):** create a Tuya IoT Cloud project,
   then `.venv/bin/pip install tinytuya && .venv/bin/python -m tinytuya
   wizard` → sends `devices.json` (18 Tuya devices on the LAN). Send it →
   I build `RealTinyTuyaBackend`.
3. **Track C — BullMQ durable scheduler (my side, ~30 min):** swap the
   in-memory scheduler so "warm the hot tub for 9pm" survives a reboot.
   M3's done-when isn't fully met without it.

### Smaller wins, queued

- **Save jazz/ambient playlists to Sonos** (owner, in the Sonos app) so
  `play smooth jazz` resolves — the `play` fallback now searches saved
  playlists after Favorites.
- **Master-bedroom UPnP 800 resilience** — adapter retry/re-subscribe, ~20
  min, offered.
- **Rotate exposed credentials** (§8 / §2 warning).
- **Tailscale ACL for port 3000** + verify allowed/blocked devices.

### Then (near-term milestones)

- **M6** Multi-actor identity + approval queue (needs OPEN_QUESTIONS §2/§8/§9 answered)
- **M7** Observability + planner eval set (gates voice and learning)
- Remaining real backends (Control4, Tuya, TVs)

---

## 6 · Key decisions already made (don't relitigate without cause)

| Decision | Where recorded |
|---|---|
| MQTT as the language-agnostic adapter boundary | ARCHITECTURE.md |
| LLM = planner over world model, not device driver | PROJECT_REPORT.md §1 |
| Fast-path regex + LLM escalation split | ARCHITECTURE.md |
| Scenes: C4 dealer owns Composer scenes; brain owns cross-vendor compositions; `run_c4_scene` bridges | ARCHITECTURE.md "Scenes", TOOL_SCHEMA.md |
| Actors: yaml seeds Postgres table; table is live truth; enforcement in code post-LLM | ARCHITECTURE.md "Identity" |
| Prompt caching designed in from day one (persona + house cached; state fresh) | ARCHITECTURE.md "Prompt caching layout" |
| Home Assistant deferred with explicit trigger conditions | docs/HA_DECISION.md |
| Default planner model `claude-sonnet-4-6`; `claude-opus-4-7` reserved for heavy scenes | PROJECT_REPORT.md §9, `.env.example` |
| Backing services bind 127.0.0.1 only; port 3000 is the sole remote surface, gated by Tailscale ACL | docker-compose.yml, OPEN_QUESTIONS §11 |
| Tailscale-only remote access; never internet-exposed | OPEN_QUESTIONS §11 |
| Single house, single timezone (America/Los_Angeles) | PROJECT_REPORT.md §2 |

---

## 7 · Environment quick reference

| Thing | Value |
|---|---|
| Mac mini Tailscale name / IP | `opens-mac-mini` / 100.109.190.15 |
| Mac mini local user | `openclaw` |
| Repo path on mini | `~/code/HomeIOT` |
| Branch | `claude/admiring-planck-CwkwR` |
| Dashboard | `http://opens-mac-mini:3000/` (via Tailscale) or `http://localhost:3000` |
| Brain HTTP | port 3000 (Fastify; `/healthz`, `/world`, `/events`, `/schedule`, `/message`, `/` dashboard) |
| MQTT / Postgres / Redis | localhost-only: 1883 / 5432 / 6379 |
| Start everything | `./scripts/run-all.sh` → tmux session `brain` |
| Stop everything | `tmux kill-session -t brain` |
| Tailnet owner | home manager (andy@) — ACL changes go through him |

---

## 8 · Gotchas learned the hard way (save yourself the debugging)

- **pnpm 10 blocks postinstall scripts** — allowlist is in
  `pnpm-workspace.yaml`; without it Prisma's engine never builds.
- **Homebrew Python is PEP 668 externally-managed** — always use `.venv/`,
  never system pip.
- **zsh on macOS chokes on pasted comments** (`#` + apostrophes start a
  `quote>` continuation) — give the user comment-free command blocks.
- **`pnpm approve-builds` auto-writes `pnpm-workspace.yaml`** — can collide
  with the committed version on `git pull` (untracked-file merge error;
  fix: `rm` the local one and re-pull).
- **Sonos zone names must match the app exactly**, including capitalization.
- **Background long-running commands in cloud sessions**: use
  `run_in_background` + Monitor with until-loops; piped `tail` buffers
  output invisibly.
- **macOS server hygiene**: `pmset autorestart 1` + sleep disabled, or the
  whole system dies silently at the first power blip / idle timeout.
- **Autostart mode**: `launchd-boot.sh` brings the brain up in real mode
  (Sonos + iAquaLink). If a reboot's session is running mocks, you're on an
  old boot script — `git pull` and re-run `scripts/resume.sh`. Mode flags
  only take effect on a *fresh* `run-all.sh`, so `resume.sh` kills the
  existing session first.
- **Python adapters don't load `.env`** — `run-all.sh` sources it so panes
  inherit `IAQUALINK_EMAIL`/`PASSWORD` etc. A stale tmux session created
  before that fix won't have them; kill and restart.
- **Credentials with `#`/`$`/backtick**: single-quote the value in `.env`
  (`KEY='R#AFW...'`) so bash's `set -a` sourcing doesn't mangle it.

---

## 9 · Definition of done for "v1 live"

From ROADMAP + OPEN_QUESTIONS defaults (pending user confirmation):

1. "Pause music in the living room" texted from the owner's phone pauses
   the actual living-room Sonos in <2s.
2. "Warm the hot tub for 9pm" schedules durably (survives a Mac mini
   reboot) and fires against the real iAquaLink.
3. "Movie night" fires the dealer's `theater_movie` C4 scene AND drops
   real Sonos volume in adjacent rooms in one user-visible action.
4. Dashboard reachable from owner + partner phones via Tailscale; son's
   device verified blocked.
5. All of the above with the LLM planner live (API key in place) and the
   pre-flight checklist in `DATA_INGESTION_CHECKLIST.md §11` green.
