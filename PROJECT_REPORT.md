# Home Brain — Project Report

**A natural-language home control system for a Bay Area smart home**

> Status: design phase. This document is the canonical reference for the system's goals, architecture, and build plan. Everything else in the repo derives from it.

---

## 1. Executive summary

Home Brain is a local-first orchestration layer that sits on a Mac mini and unifies a diverse fleet of IoT systems behind a single natural-language interface. The user types or speaks a command — "change the music to jazz rock in the living room," "warm the hot tub for 9pm," "movie night in the theater" — and the system translates that intent into a coordinated set of device actions across Control4, Sonos, iAquaLink, Tuya, IP TVs, and other devices.

The architectural bet is that **the LLM should be a planner over a clean world model, not a driver of devices**. Each device family gets its own adapter that speaks the native protocol and publishes canonical state to an MQTT bus. A small fast-path router handles trivial commands directly; ambiguous or compound intents are escalated to Claude with a tool-use interface that knows the house as a whole.

The first vertical slice is Sonos end-to-end (chat → intent → MQTT → device → state feedback), followed by Control4 via dealer-exposed scenes, then progressive adapter rollout.

---

## 2. Goals

### Primary

1. **Natural-language control** of every controllable device in the home, executed in well under a second for fast-path commands and within ~3 seconds for LLM-planned ones.
2. **A single source of truth** for device state, kept current regardless of which app or keypad triggered a change.
3. **Scheduled and conditional actions** ("warm the hot tub at 9pm if I'm home", "dim the lights when the TV turns on") that survive reboots.
4. **Composable scenes** that span vendors atomically — "movie night" coordinates C4 lights, Sonos volume in adjacent rooms, the TV, the AVR, and the shades in one logical action.
5. **Local-first operation** — everything runs on the LAN and survives an internet outage. Cloud access is a later layer via Tailscale.

### Secondary (explicit non-goals for v1)

- No voice front-end in v1. Text via iMessage / web is sufficient and removes a hard subproblem.
- No multi-home / multi-tenant support. Single house, single trusted user set.
- No replacement of Control4 itself — C4 keeps doing what it's good at (keypad routing, hard-wired AV switching). We integrate with it, not around it.

### Success criteria for v1

- Type "play jazz rock in the living room" → Sonos in the living room is playing jazz rock within 2 seconds, world state reflects it, and a second message asking "what's playing?" returns the right answer.
- Type "warm the hot tub for 9pm" → a persistent job is scheduled, survives a Mac mini reboot, and fires successfully at 9pm.
- Type "movie night" → at minimum 4 devices across 2+ vendors transition to a defined target state in a single atomic-looking operation.

---

## 3. The device landscape

| Family | Devices | Integration path | Reliability | Latency |
|---|---|---|---|---|
| Control4 | Lights, TV routing, music routing, scenes, security cameras | `pyControl4` (unofficial Director REST + WebSocket) | Medium — works on OS 2.10+ and OS 3.0+ but firmware updates can break it | <500ms LAN |
| Sonos | Per-room speakers | `node-sonos-http-api` (UPnP/SOAP wrapper) | High — stable since 2016, still works on S2 | <200ms LAN |
| iAquaLink | Pool pump, lights, heater, spa | `iaqualink-py` (cloud REST, reverse-engineered) | Medium — cloud dependency, polling-based | 10–30s state propagation |
| Tuya / Smart Life | Sauna, miscellaneous switches | `tinytuya` (local LAN protocol 3.1–3.5) | Medium-high once local key is extracted; needs initial cloud handshake | <300ms LAN |
| IP TVs | Per-brand (Samsung Tizen / LG webOS / Sony Bravia / Apple TV) | Per-brand HTTP/WebSocket or HDMI-CEC via Pulse-Eight | Variable | <1s |
| Random WiFi switches | Light switches, fountain switches | Likely Tuya or Kasa (`python-kasa`); fold into Tuya adapter where possible | High locally | <300ms |

### Notes from research

- **pyControl4** is the unofficial library that powers Home Assistant's Control4 integration. It uses Control4's built-in REST API plus a WebSocket for real-time state updates. Bearer tokens expire every 86,400 seconds and must be refreshed. The library exposes lights, climate, security, blinds, and generic items — but **the highest-value integration pattern is firing pre-programmed scenes** that the C4 dealer has set up via Composer, not micromanaging individual devices. This keeps the messy "programming logic" inside C4 where it belongs and gives the brain a clean catalog of named scenes.
- **node-sonos-http-api** (jishi) is the de facto Sonos local API. Still working as of 2025 on Sonos S2 firmware. Risk: Sonos drops UPnP in a future firmware update, which would break it. Mitigation: abstract the Sonos calls behind our adapter so swapping is a single-file change.
- **iaqualink-py** (flz) was rewritten in 2025 with httpx, retries, and 401 replay. It's the same library Home Assistant uses. Cloud-dependent, but the only realistic path — Jandy/Zodiac's local protocol is undocumented.
- **tinytuya** (jasonacox) supports Tuya protocols 3.1–3.5 with full local control. Critical setup step: extract per-device `local_key` from the Tuya IoT Cloud Platform via the built-in wizard. Once extracted, no cloud dependency. Network requires UDP 6666/6667/7000 and TCP 6668 open.

---

## 4. Architecture

### 4.1 Five layers

```
┌──────────────────────────────────────────────────────────────┐
│  L5  Interfaces:  iMessage bridge · Web UI · CLI · later TTS  │
├──────────────────────────────────────────────────────────────┤
│  L4  Orchestrator:  intent router → fast-path | LLM planner   │
│                     scheduler · scene engine · approval queue │
├──────────────────────────────────────────────────────────────┤
│  L3  State:  Redis (live world model) · Postgres (history,    │
│              scenes, schedules, audit log)                    │
├──────────────────────────────────────────────────────────────┤
│  L2  Bus:  Mosquitto MQTT broker (canonical topic schema)     │
├──────────────────────────────────────────────────────────────┤
│  L1  Adapters:  one process per device family, native lang    │
│       sonos (TS) · c4 (Py) · iaqualink (Py) · tuya (Py) · tv  │
└──────────────────────────────────────────────────────────────┘
```

The bus is the boundary. Adapters never talk to each other and never call the orchestrator directly; everything goes through MQTT. This means an adapter can be in any language (TypeScript for Sonos, Python for C4 / iAquaLink / Tuya), can crash independently, and can be replaced without touching the rest of the system.

### 4.2 Canonical state model

Every device in the house is represented as a JSON document under a hierarchical key:

```
rooms.living_room.lights
rooms.living_room.music
rooms.backyard.pool
rooms.backyard.hot_tub
rooms.sauna
rooms.theater.tv
```

Each leaf has:
- a **capability set** (what it can do): `{play, pause, set_volume, set_source}` for music
- a **current state**: `{playing: true, volume: 30, source: "spotify:playlist:..."}`
- a **last-updated timestamp** and the source of the update (which adapter)
- a **pending flag** when a command is in flight but not yet confirmed

The world model lives in Redis (low-latency reads for the LLM context payload) with a write-through to Postgres for history and audit.

### 4.3 The MQTT topic schema

Two channels:

```
home/{room}/{device}/state         ← adapters publish (retained)
home/{room}/{device}/command       ← orchestrator publishes
home/_meta/adapter/{name}/health   ← adapter heartbeats
home/_events/{type}                ← cross-cutting events (presence, schedule fired, etc.)
```

State messages are JSON and **retained** so a restarting orchestrator immediately rebuilds its world view. Command messages are not retained and include a UUID so the adapter can correlate state changes back to a command for confirmation feedback.

Full schema: see `docs/MQTT_TOPICS.md`.

### 4.4 The intent pipeline

```
user message
   │
   ▼
[normalize]──► strip punctuation, expand contractions, resolve "@channel" etc.
   │
   ▼
[classify]──► fast-path regex/keyword match  ──hit──►  direct MQTT command
   │                                                       │
   │ miss                                                  ▼
   ▼                                              [confirm to user]
[plan via Claude]──► tool calls
   │
   ▼
[execute DAG]──► parallel MQTT commands, wait for state confirmations
   │
   ▼
[respond] ──► natural-language confirmation with current state
```

The fast path handles the bulk of daily commands ("pause music", "turn on pool lights") with zero LLM latency. Claude handles ambiguity ("set the mood for dinner"), composition ("get the backyard ready for tonight"), and scheduling ("warm the hot tub at 9").

### 4.5 The Claude planner

Each LLM-routed turn assembles a request with three things in scope:

1. **A compact world-state snapshot** (rooms → devices → state) under ~2K tokens
2. **A tool schema** organized by *capability*, not device. The LLM doesn't need to know whether the living room music is Sonos-direct or routed through C4 — that's the adapter layer's job.
3. **The user message and recent conversation context**

Core tools (full schemas in `docs/TOOL_SCHEMA.md`):

- `set_music(room, query | uri, action)` — play, pause, queue, volume
- `set_lights(room | zone, state, brightness?, scene?)`
- `set_climate(zone, target_temp | mode)` — covers hot tub, sauna, HVAC
- `set_video(room, on | off, source?)`
- `set_water_feature(name, state)` — fountains, pool jets, etc.
- `run_scene(name)` — fire a pre-defined multi-device scene
- `schedule_action(when, action_spec)` — persist a future action
- `query_state(path)` — read world model
- `ask_user(question, options?)` — explicit clarification when ambiguity is high

Returned tool calls go through a **validator** that confirms the room and capability exist before execution. This catches LLM hallucinations of nonexistent devices.

### 4.6 Scheduling

Scheduled actions are first-class. `schedule_action` writes a row to a Postgres `scheduled_jobs` table; a small scheduler process (BullMQ on Redis) reads pending jobs and publishes the corresponding command when due. Reboot-safe by definition.

Schema:

```sql
scheduled_jobs (
  id uuid primary key,
  fire_at timestamptz not null,
  action_spec jsonb not null,
  status text not null,         -- pending | fired | failed | cancelled
  created_by text not null,     -- user identity
  created_at timestamptz default now(),
  fired_at timestamptz,
  error text
)
```

### 4.7 State reconciliation

The hardest correctness problem: a C4 keypad press, a Sonos app interaction, or a manual switch flip changes the real world without going through the orchestrator. Every adapter MUST subscribe to native push events (C4 WebSocket, Sonos UPnP event subscription, Tuya local broadcast) and publish state changes to MQTT, not just respond to commands.

For systems without push (iAquaLink), poll on a 15–30s interval and publish on diff.

### 4.8 Optimistic updates

When the orchestrator publishes a command, it optimistically updates the world model with `pending: true` and a target state. The adapter publishes the confirmed state when it arrives, clearing `pending`. If no confirmation arrives within a per-capability timeout (e.g. 5s for Sonos, 60s for iAquaLink heat), the orchestrator emits a failure event and rolls back the optimistic state.

---

## 5. Build vs buy: the Home Assistant question

Home Assistant has integrations for **every device in this list**: Control4 (via pyControl4), Sonos, iAquaLink, Tuya, IP TVs of all brands. It also already solves state reconciliation, scheduling, and a UI. There is even an MCP add-on that exposes HA to Claude Desktop. The honest question is whether to build the adapter layer from scratch.

**The case for Home Assistant as the L1+L2+L3 stack:**
- Months of integration work avoided
- Battle-tested device drivers
- Active community fixing breakage when vendors change APIs
- Built-in dashboard for debugging

**The case against:**
- YAML-driven configuration is at odds with the Next.js / Prisma / Postgres stack already in use
- Heavyweight — runs as a full appliance, hard to embed in a broader agent fleet
- LLM planner becomes an external add-on rather than a first-class architectural component
- State model is HA's, not ours — we'd be building on someone else's ontology

**Recommended path: hybrid.** Use Home Assistant on the Mac mini as an *adapter aggregator* for the long tail (Tuya devices, weird switches, IP TVs of varied brands). Expose HA to our orchestrator via its WebSocket API as a single MQTT-bridged adapter. Keep direct adapters for high-value, high-control devices (Sonos, Control4 scenes, iAquaLink) so we own the interface contract for the things that matter most.

This is the v2 conversation, not a v1 blocker. **For v1, build direct adapters for Sonos and Control4 to learn the architecture; revisit HA before adding the long tail.**

---

## 6. Phased build plan

Each phase produces a working, demonstrable system. No phase ships only infrastructure.

### Phase 0 — Foundation (week 1)

- Mosquitto MQTT broker in Docker on the Mac mini
- Postgres + Redis in Docker
- Prisma schema for `devices`, `scenes`, `scheduled_jobs`, `audit_log`
- Skeleton TypeScript service with MQTT client, Redis client, Prisma client
- A `discover.ts` script that scans the LAN and prints what it finds (Sonos via SSDP, Tuya via UDP broadcast, mDNS for everything else)

**Done when:** `docker compose up` brings up the stack; `pnpm dev` starts the brain and connects to all three; running `discover.ts` lists every IP-addressable device.

### Phase 1 — Sonos end-to-end (week 2)

- Sonos adapter wraps `node-sonos-http-api`, exposes per-zone state on MQTT
- Fast-path classifier handles `play / pause / volume / next / previous` in named rooms
- HTTP endpoint at `POST /message` that accepts free text and returns a response
- Minimum-viable Claude planner with three tools: `set_music`, `query_state`, `run_scene`

**Done when:** `curl -d "play jazz rock in the living room" /message` actually starts playing jazz rock in the living room and returns a confirmation including the track name.

### Phase 2 — Control4 scenes (week 3)

- Coordinate with C4 dealer to expose a named-scene catalog
- Python C4 adapter using `pyControl4` (auth, WebSocket for state, scene firing)
- Bridge the C4 catalog into the world model as room-attached "scenes"
- Tools: `run_scene` now actually does something; `set_lights` for individually-controlled zones

**Done when:** typing "movie night in the theater" triggers a C4 scene that also coordinates Sonos volume in adjacent rooms via the brain (multi-vendor scene).

### Phase 3 — Pool, spa, sauna (week 4)

- Python iAquaLink adapter (poll loop, optimistic updates)
- Python Tuya adapter (LAN, scan to find sauna)
- `set_climate` tool with the temperature-target semantics
- Scheduling: `schedule_action` becomes real

**Done when:** "warm the hot tub for 9pm" actually works through a reboot, and "is the sauna ready?" returns an accurate temperature.

### Phase 4 — TVs and the long tail (week 5)

- Decision point on Home Assistant aggregator vs per-brand adapters
- IP TV control (probably HDMI-CEC via Pulse-Eight if all go through one AVR)
- Remaining WiFi switches (fountains, miscellaneous)

### Phase 5 — Interface polish (week 6)

- iMessage bridge using AppleScript / sqlite reading from `~/Library/Messages/chat.db`. Mac mini is the natural host for this; runs as a launchd agent.
- Web dashboard (Next.js, already in the stack) showing world state, recent actions, scheduled jobs, scene editor
- Approval queue for destructive actions (gate, cameras, etc.)

### Phase 6 — Convergence with the agent fleet

- Merge the home brain's world model into the broader knowledge graph
- Cross-domain scenes ("warm the hot tub and queue up the podcast I saved last night" — touches both home and the Instagram pipeline)
- Mobile approval dashboard reuses the existing pattern

---

## 7. Key decisions still to resolve

| # | Decision | Default if no preference |
|---|---|---|
| 1 | Music service priority order for ambiguous queries (Spotify vs Apple Music vs presets) | Spotify primary, fall back to Sonos favorites |
| 2 | iMessage as the primary interface, or start web-only? | Both eventually, but web-first for v1 (faster to iterate) |
| 3 | Ambiguous-room default ("turn off the lights" with no room) | Last room the user controlled |
| 4 | How much autonomy without confirmation? Door locks and the gate need explicit approval. What about scheduling? | Scheduling auto-approved within 24h; longer schedules + destructive actions need approval |
| 5 | Same Postgres instance as the entertainment tracker / Instagram pipeline, or separate? | Same instance, separate schema. Shares ops, isolates failure |
| 6 | Voice in v1? | No — text first, voice in v2 via a Whisper STT bridge (already in your stack) |
| 7 | Multi-user identity from iMessage sender ID? | Yes — trivial unlock since the bridge sees the sender |

---

## 8. Risks and mitigations

- **Sonos drops UPnP** → adapter abstraction means swap is one file; monitor the jishi repo for early warning
- **Control4 firmware update breaks pyControl4** → pin firmware version with dealer; keep a "scene-only" minimal mode that doesn't depend on individual-device commands
- **iAquaLink cloud rate limits** → respect the library's built-in 429 backoff; cache aggressively, poll on a 30s interval not 5s
- **Tuya local key rotation** → keys are stable once extracted, but a factory reset re-randomizes them. Document the recovery procedure
- **LLM hallucinates a nonexistent room or device** → tool-call validator rejects with a useful error the LLM can self-correct from
- **A scheduled action fires while the user is away and is destructive** → no destructive actions in the auto-approve schedule list (no door unlocks, no security disarms)
- **Mac mini reboots mid-scene** → MQTT retained state + Postgres job queue means recovery is automatic; in-progress scenes resume from the next pending step

---

## 9. Technology choices

| Layer | Choice | Why |
|---|---|---|
| Orchestrator language | TypeScript on Node 20+ | Matches existing stack (Next.js, Prisma) |
| Adapter languages | Polyglot — TS where libs are good, Python where they're better | pyControl4, iaqualink-py, tinytuya are all Python-only or Python-best |
| Bus | Mosquitto MQTT 2.x | Lightweight, retained messages, decades of stability |
| Live state | Redis 7 | Sub-millisecond reads for LLM context assembly |
| Persistent state | Postgres 16 with Prisma | Already in your stack |
| Scheduler | BullMQ on top of Redis | Persistent, retries, good observability |
| LLM | Claude via Anthropic API, tool use enabled. Model: `claude-sonnet-4-6` for default planning (fast, cheap, strong tool use); `claude-opus-4-7` for complex multi-step scenes | Tool use is GA, latency is acceptable, and you're already on the API |
| Discovery | mDNS via `bonjour-service`; SSDP via `node-ssdp`; Tuya UDP via tinytuya scanner | Stock approaches per protocol |
| Container | Docker Compose for the supporting services; native processes for the brain itself | Faster iteration locally; nothing fancy needed |
| Auth (for remote later) | Tailscale | One toggle, no NAT pain |

The Anthropic SDK call shape for a typical planning turn (using current GA tool use):

```ts
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: SYSTEM_PROMPT_WITH_WORLD_STATE,
  tools: TOOL_SCHEMAS,
  messages: conversationHistory,
});
// Iterate over response.content for tool_use blocks; execute; loop until stop_reason === "end_turn"
```

Reference: https://docs.claude.com/en/api/overview

---

## 10. Open questions for the next session

1. Do we want the dealer-exposed C4 scene catalog to live in Composer (source of truth there) or be defined in `config/scenes.yaml` (source of truth here, with Composer reflecting it)? Big implications for who owns the room → scene mapping.
2. iMessage bridge: AppleScript every poll vs sqlite tail of `chat.db`. The sqlite path is faster but requires Full Disk Access for the launchd agent.
3. The entertainment tracker and Instagram pipeline both have their own intent surfaces. At what point do we collapse them into a single chat interface vs keep them domain-specific? The answer probably depends on how well the LLM planner can disambiguate domains from a single message.

---

## Appendix A: A worked example

User types: **"set the backyard up for guests around 8 — hot tub warm, fountain on, pool lights blue, music low"**

1. **Normalize**: trim, lowercase, expand "8" → infer "8pm today" (if before 8pm now, otherwise "8pm tomorrow")
2. **Classify**: fails fast path (compound + scheduled + parameterized)
3. **Plan via Claude** with the world state and tools. Claude returns:
   ```json
   [
     {"tool": "schedule_action", "args": {"when": "2026-05-23T20:00:00-07:00", "actions": [
       {"tool": "set_climate", "args": {"zone": "hot_tub", "target_temp_f": 102}},
       {"tool": "set_water_feature", "args": {"name": "backyard_fountain", "state": "on"}},
       {"tool": "set_lights", "args": {"zone": "pool", "scene": "blue"}},
       {"tool": "set_music", "args": {"room": "backyard", "query": "evening playlist", "volume": 25}}
     ]}}
   ]
   ```
4. **Validate**: confirm `hot_tub`, `backyard_fountain`, `pool` zone lights, and `backyard` music zone all exist. Confirm 8pm is in the future.
5. **Persist**: write job to `scheduled_jobs`, return confirmation
6. **Respond**: "Got it — at 8pm I'll warm the hot tub to 102°F, turn on the fountain, set the pool lights to blue, and start your evening playlist in the backyard at 25%. Want me to send a reminder 15 minutes before in case you want to adjust?"

The "Want me to send a reminder?" is the system being agentic in a useful, non-intrusive way — proposing rather than acting.
