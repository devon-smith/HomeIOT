# Home Brain — Project Scope & Handoff

> **Purpose of this doc:** the single context-priming document for any new
> conversation or contributor on this project. Read this first; it tells you
> what exists, what state it's in, how to work on it, and what's next.
> Last updated: 2026-06-10.

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
| **M1 Sonos** | Intent pipeline (normalize → fast-path classifier → Claude planner w/ prompt caching), Sonos adapter, `set_music`/`query_state` tools | **Mock** — `RealSonosBackend` is a stub |
| **M2 Control4 + scenes** | Python C4 adapter, scene engine (`config/scenes.yaml`), `run_scene`/`run_c4_scene`/`set_lights` tools | **Mock** — `PyControl4Backend` is a stub |
| **M3 Pool/spa/sauna + scheduling** | Python iAquaLink + Tuya adapters, `set_climate`/`schedule_action` tools, `MemoryScheduler` | **Mock** — real backends stubbed; scheduler is in-memory (not reboot-durable) |
| **M4 TVs + long tail** | TS TV adapter (per-brand backends), `set_video`/`set_water_feature` tools, HA decision deferred | **Mock** — all 4 brand backends stubbed |
| **M5 Interfaces** | Web dashboard (vanilla JS, served at `/`), iMessage bridge (chat.db poll + osascript reply), launchd plist | Dashboard real & deployed; iMessage bridge untested on real macOS (needs FDA grants) |

### Test surface

- `pnpm typecheck` — clean
- `pnpm test` — **37 unit tests** (classifier, normalizer, scenes loader, scene engine, scheduler, schedule_action validation, iMessage pure logic)
- `pnpm smoke` — **36 assertions**, spins an in-process MQTT broker (aedes), spawns all 5 adapters in mock mode, verifies §A Sonos / §B C4 / §C scene engine / §D climate / §E scheduling / §F TV / §G water feature end-to-end

### Deployment state on the Mac mini (as of 2026-06-10)

- ✅ Repo cloned at `~/code/HomeIOT`, branch `claude/admiring-planck-CwkwR`
- ✅ `./scripts/setup-mac-mini.sh` passed all 7 steps (36 smoke assertions)
- ✅ Docker stack up (mosquitto/postgres/redis, bound to 127.0.0.1 only)
- ✅ Python venv at `.venv/` with all adapters installed
- ✅ Prisma migration `20260609224546_init` applied
- ✅ Tailscale on, device name `opens-mac-mini` (100.109.190.15), tailnet owned by the home manager (andy@); user's son has port-22-only ACL to this machine
- ⚠️ `ANTHROPIC_API_KEY` **not yet** in `.env` — LLM planner disabled, fast-path only
- ⚠️ Tailscale ACL for port 3000 (`tag:homebrain-server` / `tag:homebrain-users`) may not be applied yet — see `DATA_INGESTION_CHECKLIST.md §10`
- ⚠️ No launchd autostart for the brain — after reboot someone must SSH in and run `./scripts/run-all.sh`
- ⚠️ Power settings / auto-login / Screen Sharing / FDA grants — checklist given, completion unconfirmed

### What is NOT real yet (the entire real-hardware integration)

Every adapter runs in mock mode. The real backends are deliberate,
clearly-marked stubs with implementation notes in each file:

| Stub | File | Library to use |
|---|---|---|
| Sonos | `src/adapters/sonos/sonos-backend.ts` | `sonos` (npm) |
| Control4 | `adapters-py/control4/home_brain_control4/pycontrol4_backend.py` | `pyControl4` |
| iAquaLink | `adapters-py/iaqualink/home_brain_iaqualink/iaqualink_backend.py` | `iaqualink` |
| Tuya | `adapters-py/tuya/home_brain_tuya/tinytuya_backend.py` | `tinytuya` |
| TVs (4 brands) | `src/adapters/tv/brand-backends.ts` | per-brand |
| Durable scheduler | `src/core/scheduler.ts` (`BullMQScheduler` class) | BullMQ + Postgres |

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

1. **Finish Mac mini hardening** (physical/GUI, ~15 min): `pmset` power
   settings, auto-login, Docker Desktop + Tailscale autostart, Screen
   Sharing on, reboot test. (Checklist in the last session; partially done.)
2. **Tailscale ACL for the dashboard**: home manager applies the
   `tag:homebrain-server`/`tag:homebrain-users` snippet from
   `DATA_INGESTION_CHECKLIST.md §10`; verify phone-on-cellular loads
   `http://opens-mac-mini:3000/` AND son's device **cannot**.
3. **Add `ANTHROPIC_API_KEY` to `.env`** on the Mac mini → unlocks the LLM
   planner (currently fast-path only).
4. **Run `pnpm discover` from the home LAN** → device inventory for
   `config/house.yaml`.
5. **Send the Control4 dealer email** (4 asks in
   `DATA_INGESTION_CHECKLIST.md §3`) — the only week-of-calendar-lag item.
6. **Answer the BLOCKING items in `docs/OPEN_QUESTIONS.md`** — scenes list,
   destructive-action list, default temperatures, actor handles, v1 demo
   definition.
7. **First real backend: `RealSonosBackend`** (~15 min per checklist §2) —
   the cheapest real-hardware win; proves the whole chain against a real
   device.
8. **launchd autostart for brain + adapters** — closes the
   "manual restart after reboot" gap. Offered but not yet built.

### Then (near-term milestones)

- **M6** Multi-actor identity + approval queue (needs OPEN_QUESTIONS §2/§8/§9 answered)
- **M7** Observability + planner eval set (gates voice and learning)
- **BullMQScheduler** for reboot-durable scheduling (M3 done-when isn't fully met without it)
- Remaining real backends (C4 after dealer responds; iAquaLink; Tuya after wizard run; TVs)

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
