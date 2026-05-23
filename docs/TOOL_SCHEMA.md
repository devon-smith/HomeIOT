# Tool schema

The set of tools Claude sees in the planner. Organized by capability, not by vendor — the LLM never needs to know whether the living room music is Sonos or routed through C4.

The full JSON schemas live in `src/intent/tools/` (added in Phase 1). This doc is the human-readable reference.

## Conventions

- All `room` and `zone` arguments must match a slug defined in `config/house.yaml`. A validator rejects unknown values before execution.
- All time arguments are ISO 8601 with a timezone offset. The orchestrator's default tz is `America/Los_Angeles` and Claude is told this in the system prompt.
- Optional args default to "no change" — e.g. `set_lights({ room: "kitchen", on: true })` does not affect brightness.
- Every tool call returns a `{ ok: boolean, message: string, state?: ... }` envelope.

## Tools

### `set_music`

```ts
{
  room: string;                       // required
  action?: "play" | "pause" | "resume" | "next" | "previous" | "set_volume";
  query?: string;                     // free-text search ("jazz rock", "evening playlist")
  uri?: string;                       // explicit ("spotify:playlist:abc")
  volume?: number;                    // 0–100
}
```

Either `query`, `uri`, or `action` must be present. `volume` is independent and can be set alone.

### `set_lights`

```ts
{
  room?: string;                      // either room or zone
  zone?: string;                      // e.g. "pool", "outdoor", spans rooms
  on?: boolean;
  brightness?: number;                // 0–100
  scene?: string;                     // named scene from house.yaml
  color?: string;                     // hex or named ("warm_white", "blue")
}
```

### `set_climate`

```ts
{
  zone: string;                       // "hot_tub", "sauna", "hvac_main"
  target_f?: number;
  mode?: "heat" | "cool" | "off" | "auto";
}
```

### `set_video`

```ts
{
  room: string;
  on?: boolean;
  input?: string;                     // "apple_tv", "hdmi3", source name
  volume?: number;
}
```

### `set_water_feature`

```ts
{
  name: string;                       // "backyard_fountain", "pool_jets"
  on: boolean;
}
```

### `run_scene`

```ts
{
  scene: string;                      // slug from config/scenes.yaml
  room?: string;                      // disambiguates room-scoped scenes
}
```

Runs a brain-owned, cross-vendor composition. Each step in the scene is itself
a tool call (including possibly `run_c4_scene`), executed in declared order
with parallelism where the steps are independent.

### `run_c4_scene`

```ts
{
  name: string;                       // name as defined by the C4 dealer in Composer
  room?: string;                      // optional room context
}
```

Fires a single Control4 scene programmed in Composer. This is the brain's
escape hatch for C4-internal logic — lighting presets, AVR routing,
projector start-up — without trying to re-implement that logic upstream.
Brain-owned compositions in `run_scene` typically invoke one or more of
these as steps.

### `schedule_action`

```ts
{
  when: string;                       // ISO 8601
  actions: ToolCall[];                // array of any of the other tool calls
  label?: string;                     // user-visible name, e.g. "warm hot tub for 9pm"
  reminder_minutes_before?: number;   // optional pre-fire notification
}
```

The orchestrator validates each nested action before persisting.

### `query_state`

```ts
{
  path?: string;                      // e.g. "rooms.living_room.music"; omit for whole world
}
```

Returns the current state slice. Used by Claude to answer questions like "what's playing?".

### `ask_user`

```ts
{
  question: string;
  options?: string[];                 // optional multiple choice
}
```

When the model is uncertain, it asks rather than guessing. Resolves via a follow-up message turn.

## Permissions

Each tool has a permission level enforced at execution time, independent of what the planner proposes:

| Tool | Owner | Partner | Guest |
|---|---|---|---|
| `query_state` | ✅ | ✅ | ✅ |
| `set_music` | ✅ | ✅ | ✅ |
| `set_lights` | ✅ | ✅ | ✅ |
| `set_climate` | ✅ | ✅ | ❌ |
| `set_video` | ✅ | ✅ | ✅ |
| `set_water_feature` | ✅ | ✅ | ❌ |
| `run_scene` | ✅ | ✅ | scene-dependent |
| `run_c4_scene` | ✅ | ✅ | scene-dependent |
| `schedule_action` | ✅ | ≤24h only | ❌ |
| `ask_user` | ✅ | ✅ | ✅ |

Destructive actions (door locks, security disarm, gate) are not in this list; they go through the approval queue regardless of actor.

## Validation

Before any tool call executes:

1. Schema check (zod).
2. Existence check: `room`, `zone`, `scene`, `name` must resolve in `config/house.yaml` or `config/scenes.yaml`.
3. Permission check against `actor` (resolved against the live `actors` Postgres table — yaml seeds it on first boot; runtime additions like temporary house-sitters live only in the table).
4. Approval-queue check for destructive ops.

Failures return `{ ok: false, message: "..." }` to the planner, which can self-correct on the next turn.
