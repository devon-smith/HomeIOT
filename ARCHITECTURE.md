# Architecture

A technical deep-dive on Home Brain's design. For the why and the strategy, see [PROJECT_REPORT.md](PROJECT_REPORT.md).

## The five layers

```
┌──────────────────────────────────────────────────────────────┐
│  L5  Interfaces                                              │
│      ┌──────────┐  ┌──────────┐  ┌──────────┐                │
│      │ iMessage │  │  Web UI  │  │   CLI    │  …             │
│      └─────┬────┘  └─────┬────┘  └─────┬────┘                │
│            │             │             │                     │
│            └─────────────┼─────────────┘                     │
│                          │ POST /message                     │
├──────────────────────────┼───────────────────────────────────┤
│  L4  Orchestrator        ▼                                   │
│            ┌───────────────────────────┐                     │
│            │  intent router            │                     │
│            │  ├─ fast-path classifier  │                     │
│            │  └─ Claude planner        │                     │
│            └─────────┬─────────────────┘                     │
│                      │                                       │
│   ┌──────────────────┼──────────────────┐                    │
│   │                  │                  │                    │
│   ▼                  ▼                  ▼                    │
│ scene engine    scheduler         approval queue             │
├──────────────────────────────────────────────────────────────┤
│  L3  State                                                   │
│      ┌──────────────┐    ┌──────────────────────┐            │
│      │  Redis       │◄───┤  Postgres            │            │
│      │  (live)      │    │  (history, scenes,   │            │
│      │              │    │   schedules, audit)  │            │
│      └──────┬───────┘    └──────────────────────┘            │
├─────────────┼────────────────────────────────────────────────┤
│  L2  Bus    │                                                │
│      ┌──────▼───────────────────────────────────────────┐    │
│      │  Mosquitto MQTT broker                           │    │
│      │  home/{room}/{device}/state    [retained]        │    │
│      │  home/{room}/{device}/command                    │    │
│      │  home/_meta/adapter/{name}/health                │    │
│      │  home/_events/{type}                             │    │
│      └──────┬───────────────────────────────────────────┘    │
├─────────────┼────────────────────────────────────────────────┤
│  L1  Adapters (one process per device family)                │
│             │                                                │
│   ┌─────────┼─────────┬────────────┬──────────┬──────────┐   │
│   ▼         ▼         ▼            ▼          ▼          ▼   │
│ sonos    control4  iaqualink     tuya       tv        kasa   │
│ (TS)     (Py)      (Py)          (Py)       (TS)      (TS)   │
│   │         │         │            │          │          │   │
│   ▼         ▼         ▼            ▼          ▼          ▼   │
│ Sonos    C4 ctrl   iAquaLink    Tuya       TVs       Switch  │
│ UPnP     Director  cloud        local      brand-     local  │
│          REST/WS                LAN        specific          │
└──────────────────────────────────────────────────────────────┘
```

## Data flow: a command

```
1. user "play jazz rock in living room" → HTTP POST /message
2. orchestrator → classify
3.   fast-path hit on "play X in Y" pattern
4. orchestrator → publish to home/living_room/music/command
   { id: "uuid", op: "play", query: "jazz rock" }
5. sonos adapter receives → searches → starts playback
6. sonos adapter publishes to home/living_room/music/state (retained)
   { playing: true, track: "...", source: "...", _cmd_id: "uuid" }
7. orchestrator sees state update with matching cmd_id → confirms to user
   "Playing 'Live at Leeds' by The Who in the living room."
```

## Data flow: a state change from outside

```
1. user presses pause on the Sonos app
2. sonos zone broadcasts UPnP event
3. sonos adapter receives → publishes home/living_room/music/state
   { playing: false, ... }   (no _cmd_id because not triggered by us)
4. orchestrator updates Redis world model
5. next user message has accurate state
```

## Data flow: scheduled action

```
1. user "warm the hot tub at 9"
2. orchestrator → Claude planner
3. Claude returns schedule_action tool call
4. orchestrator writes row to scheduled_jobs (Postgres)
5. orchestrator queues BullMQ job with delay = (9pm - now)
6. orchestrator confirms to user
7. [time passes; Mac mini reboots once; BullMQ recovers job from Postgres-backed queue]
8. 9pm: BullMQ fires → publishes command to MQTT
9. iaqualink adapter receives → calls iAquaLink cloud → updates state
10. orchestrator sees state change → optionally notifies user
```

## Why MQTT as the boundary

Three reasons that all matter:

1. **Language-agnostic adapters.** Sonos has a great Node lib; Control4 has a great Python lib. MQTT means each adapter uses its native ecosystem.
2. **Crash isolation.** An adapter dying takes that device family offline but nothing else. The orchestrator restarts cleanly because state is retained on the broker.
3. **Observability.** Tailing `mosquitto_sub -h localhost -t 'home/#' -v` shows you every event in the system. Invaluable for debugging.

The cost is one extra hop of latency. On localhost MQTT this is <2ms; negligible.

## Why optimistic state updates

Latency hierarchy in this system:

- LAN command issue → <50ms (most adapters)
- Adapter receives, calls native protocol → 50–500ms
- Device responds, adapter publishes state → another 50–500ms
- iAquaLink (cloud): 1–30s for state confirmation

If we waited for confirmed state before responding to the user, every interaction would feel slow and the LLM would have stale data on the next turn. Optimistic updates close the loop: orchestrator marks state `pending: true` with the target value the moment a command goes out; adapter publishes confirmed state when it arrives, clearing `pending`.

The LLM context shows `pending` to Claude so it knows not to immediately re-issue the same command. The user-facing response is "I've asked the hot tub to warm to 102°F — that takes about 20 minutes." Honesty about latency, not denial of it.

## Why a fast path + LLM path split

A Claude tool-use round-trip is 1–3 seconds. For "pause music" that's a regression versus pressing the button on the Sonos app. For "set the mood for dinner" it's the only thing that works.

The classifier is intentionally dumb: a small ordered list of regex patterns mapping to direct tool calls. If nothing matches, escalate.

```ts
const fastPathPatterns = [
  { regex: /^(pause|stop) (?:the )?music(?: in (?:the )?(\w+))?$/i,
    tool: "set_music",
    map: (m) => ({ room: m[1] ?? lastRoom(), action: "pause" }) },
  { regex: /^(?:turn |switch )?(\w+) (?:room )?lights? (on|off)$/i,
    tool: "set_lights",
    map: (m) => ({ room: normalizeRoom(m[1]), state: m[2] }) },
  // … more patterns added as usage data accumulates
];
```

After v1 ships, the patterns get added based on actual usage logs. Day-one coverage doesn't matter much; what matters is the *path* exists and the classifier is in the right place architecturally.

## Why one Postgres for everything

Single instance, separate schemas. Operationally simpler than running three Postgreses. Failure isolation comes from the adapter pattern, not from database segregation.

```
postgres
├── home_brain         <- this project
├── second_brain       <- agent fleet knowledge layer
├── entertainment      <- entertainment tracker
└── instagram_pipeline <- saved-posts pipeline
```

## Scenes: brain composes, C4 owns vendor scenes

There are two kinds of scenes in the system, and conflating them was a real risk.

**C4-internal scenes** live in Composer. The dealer programs them: "theater_movie" routes the projector, drops the screen, lowers theater lights to 10%, sets the AVR input. They're tight, well-tested, and they should stay in Composer — the brain has no business re-implementing AV routing logic.

**Brain compositions** live in `config/scenes.yaml`. They're cross-vendor: "movie night" fires `theater_movie` (C4), drops Sonos volume in adjacent rooms, optionally pauses outdoor music. Each step is a tool call; one of those tools is `run_c4_scene(name)` which calls into the C4 adapter.

```yaml
# config/scenes.yaml
scenes:
  movie_night:
    name: Movie Night
    rooms: [theater]
    actions:
      - tool: run_c4_scene
        args: { name: theater_movie }       # dealer-owned
      - tool: set_music
        args: { room: living_room, volume: 10 }
      - tool: set_music
        args: { room: kitchen, volume: 10 }
```

When the LLM gets the tool schema, it sees both `run_scene` (for brain compositions) and `run_c4_scene` (for vendor scenes) — and the system prompt names the available scenes in each category. If "movie night" is a brain composition, the LLM picks `run_scene`. If "all off" only exists in Composer, the LLM picks `run_c4_scene`. Both surfaces are first-class.

This design also makes Phase 2 cleanly testable: the brain can fire `run_c4_scene` without yet having any brain compositions, and Phase 2's "done when" criterion ("movie night" coordinates across vendors) just means writing one yaml entry.

## The Claude context window

Every LLM-routed turn assembles a prompt with these sections in order:

1. **System prompt** (static, ~500 tokens): persona, behavior, constraints, output format.
2. **House definition** (mostly static, ~800 tokens): rooms list, devices in each room, scenes catalog, capabilities map.
3. **Current state snapshot** (dynamic, ~600 tokens): a compact JSON of the world model — only rooms/devices that have non-default state, plus anything `pending`.
4. **Conversation history** (last 4–6 turns, ~400 tokens): for follow-ups like "make it louder".
5. **User message** (~50 tokens).

Total: ~2.4K tokens of input. Tool schemas add another ~800. Comfortably within Sonnet's context.

### Prompt caching layout

The structure above maps cleanly to Anthropic's prompt cache. Roughly 2K tokens of the per-turn payload barely change between turns — caching them cuts both latency and cost dramatically.

```
┌─────────────────────────────────────────────────────────┐
│ system param                                            │
│   ┌────────────────────────────────────────────────┐    │
│   │ persona + behavior + output format             │ ◄──┤ cache breakpoint #1
│   │ (changes when we ship a new release)           │    │ ≈500 tok, rarely
│   └────────────────────────────────────────────────┘    │
│   ┌────────────────────────────────────────────────┐    │
│   │ house definition (rooms, devices, scenes,      │    │
│   │ actor permissions for this user)               │ ◄──┤ cache breakpoint #2
│   │ (changes when house.yaml/scenes.yaml change)   │    │ ≈800 tok, occasionally
│   └────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│ tools param                                             │
│   tool schemas                                          │ ◄── cached automatically
│   (changes when tools change)                           │     when over threshold
├─────────────────────────────────────────────────────────┤
│ messages: [                                             │
│   { role: user,    content: state snapshot }            │   not cached
│   { role: user,    content: conversation history }      │ ◄─ optional cache #3
│   { role: user,    content: this turn's message }       │   not cached
│ ]                                                       │
└─────────────────────────────────────────────────────────┘
```

Expected savings on a typical planning turn: 2K input tokens served from cache instead of fresh. Cache reads are ≈10× cheaper than fresh tokens and TTFT drops noticeably. The state snapshot stays fresh on every turn so the LLM never sees stale device state.

Two design implications worth keeping in the Phase 1 planner from the start:

1. The state snapshot is injected as a separate message block, not concatenated into the system prompt. This is what keeps the cache stable.
2. The system prompt should be assembled in a stable, deterministic order — sorting room keys, sorting device keys — so trivial enumeration differences don't bust the cache.

## Identity and multi-user

iMessage bridge sees the sender's phone number / Apple ID — pass that into the orchestrator as `actor`. Different actors have different permissions:

- Owner: anything
- Partner: anything except scheduling > 24h and disarming security
- Guest (e.g. when someone is house-sitting): query state, music, lights — no climate, no security, no destructive

### Storage: yaml seeds, Postgres is the live truth

The base set of actors (owner, partner) is declared in `config/house.yaml`:

```yaml
actors:
  owner:
    role: owner
    imessage_handles: ["+15551234567"]
  partner:
    role: partner
    imessage_handles: ["+15559876543"]
```

On startup, the brain reconciles this seed into the Postgres `actors` table. Runtime additions — say a house-sitter coming for a week — are inserted with `expires_at` set, no yaml edit needed:

```ts
await prisma.actor.create({
  data: {
    slug: "guest_alice",
    role: "guest",
    displayName: "Alice (house-sitter)",
    imessageHandles: ["+15555550100"],
    expiresAt: addDays(new Date(), 7),
  },
});
```

A periodic sweep marks `expiresAt < now()` actors inactive (or hard-deletes them — TBD by policy).

This is a permission check at the tool-execution layer, after the LLM planner. The LLM is told what the actor is allowed to do (via the system prompt) so it doesn't propose forbidden actions, but the enforcement is in code.

## Failure modes and recovery

| Failure | Detection | Recovery |
|---|---|---|
| Adapter crashes | Heartbeat absent from `home/_meta/adapter/X/health` for >30s | Systemd / launchd restarts it; world state preserved via retained MQTT |
| MQTT broker crashes | Orchestrator gets connection-lost event | Reconnect with backoff; retained state restores |
| Postgres unreachable | Query errors | Brain enters degraded mode: fast-path only, no scheduling, in-memory audit only |
| Redis unreachable | World state reads fail | Fall back to subscribing to retained MQTT topics directly; slower but functional |
| Claude API down or slow | Tool-use call times out at 10s | Tell user the LLM is unreachable; suggest a fast-path rephrasing |
| Device unreachable | Adapter sees timeout on native call | Adapter publishes `state: unknown, last_seen: ts`; orchestrator surfaces in response |
| Scheduled job missed because Mac mini was off | BullMQ recovers on startup | Configurable per job: fire immediately, skip, or notify user to decide |

## Where this goes next

The home brain is the second concrete domain in the broader agent fleet (the first being the Instagram pipeline / second-brain). Both publish into the same MQTT bus eventually, both write to the same Postgres instance with different schemas, and both can be invoked from the same chat interface.

The architectural payoff is cross-domain scenes: "warm the hot tub and queue the podcast I saved last night" routes to two different adapter families (iAquaLink + Sonos) plus a knowledge-graph lookup (which podcast?). The world model + tool-use pattern handles this naturally because the LLM just calls multiple tools.
