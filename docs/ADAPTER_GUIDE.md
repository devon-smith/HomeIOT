# Adapter guide

How to write a new device adapter for Home Brain.

## What an adapter is

A single process that:

1. Speaks the native protocol for one device family (Sonos UPnP, C4 Director REST, Tuya LAN, …).
2. Subscribes to its commands on `home/{room}/{device}/command`.
3. Publishes its state on `home/{room}/{device}/state` (retained).
4. Publishes a heartbeat on `home/_meta/adapter/{name}/health` (retained) every 15s.
5. Subscribes to native push events where available, polls otherwise, and publishes state diffs to MQTT.

It does **not** talk to other adapters, the database, or the orchestrator directly. The MQTT bus is the entire interface.

## Language choice

Pick the language with the best native library.

- TypeScript: Sonos (`sonos`/`node-sonos-http-api`), most IP TVs, Kasa, anything with a good Node lib.
- Python: Control4 (`pyControl4`), iAquaLink (`iaqualink-py`), Tuya (`tinytuya`), anything with a good Python lib.

TypeScript adapters live under `src/adapters/{family}/`. Python adapters live under `adapters-py/{family}/` with a `pyproject.toml` per adapter.

## Required behaviors

### Identity and health

The adapter has a stable `name` ("sonos", "control4", "iaqualink"). On startup it publishes to `home/_meta/adapter/{name}/health` with a Last Will set to `{ "online": false, "ts": "..." }` so unexpected disconnects are visible.

Heartbeat every 15s:

```json
{
  "ts": "...",
  "name": "sonos",
  "version": "0.1.0",
  "uptime_s": 4827,
  "devices_online": 4,
  "devices_total": 5,
  "last_error": null
}
```

### Commands

Subscribe to `home/+/+/command` and filter by the rooms/devices this adapter owns (declared in `config/house.yaml`). Validate the command payload before acting. On any failure, publish a state update with `pending: false` and surface the error via `home/_events/error`.

### State

Publish to `home/{room}/{device}/state` whenever:

- A command this adapter handled completes (echo `_cmd_id`).
- A native push event arrives (no `_cmd_id`).
- A periodic poll detects a diff (no `_cmd_id`).

State is **retained**. The full payload, not a diff — the broker replaces the retained value entirely.

### Push vs poll

Prefer push. Implementations:

- **Sonos**: UPnP event subscription via `node-sonos-http-api` callbacks.
- **Control4**: Director WebSocket. Reconnect with backoff.
- **Tuya**: local listener on UDP broadcast (tinytuya `Cloud()` or local heartbeat).
- **iAquaLink**: no push. Poll every 20–30s, publish on diff. Respect the library's 429 backoff.

Poll-on-diff is required even with push, as a safety net. Run polls 4–6× slower than the push expectations.

### Optimistic state and timeouts

The orchestrator marks state `pending: true` when it issues a command. The adapter clears `pending` by publishing the new confirmed state. If the adapter cannot confirm within its capability timeout, it must publish a state update with `pending: false, last_error: "timeout"` so the orchestrator can roll back.

| Capability | Timeout |
|---|---|
| Music play/pause/volume | 5s |
| Lights on/off/brightness | 5s |
| TV on/off/input | 10s |
| Climate target temp | 60s (state changes are slow) |
| Water feature on/off | 10s |

## Skeleton (TypeScript)

```ts
import mqtt from "mqtt";

const NAME = "example";
const VERSION = "0.1.0";
const startedAt = Date.now();

const client = mqtt.connect(process.env.MQTT_URL!, {
  will: {
    topic: `home/_meta/adapter/${NAME}/health`,
    payload: JSON.stringify({ name: NAME, online: false, ts: new Date().toISOString() }),
    qos: 1,
    retain: true,
  },
});

client.on("connect", () => {
  client.subscribe("home/+/+/command", { qos: 1 });
  publishHealth();
  setInterval(publishHealth, 15_000);
});

client.on("message", async (topic, payload) => {
  const [, room, device, kind] = topic.split("/");
  if (kind !== "command") return;
  const cmd = JSON.parse(payload.toString());

  // 1. Filter: does this adapter own this room/device?
  // 2. Validate the command (zod)
  // 3. Call the native protocol
  // 4. Publish state with _cmd_id = cmd.id
});

function publishHealth() {
  client.publish(
    `home/_meta/adapter/${NAME}/health`,
    JSON.stringify({
      ts: new Date().toISOString(),
      name: NAME,
      version: VERSION,
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      devices_online: 0,
      devices_total: 0,
      last_error: null,
    }),
    { qos: 1, retain: true },
  );
}
```

## Skeleton (Python)

```python
import os, json, time, asyncio
import paho.mqtt.client as mqtt

NAME = "example"
VERSION = "0.1.0"
started_at = time.time()

client = mqtt.Client()
client.will_set(
    f"home/_meta/adapter/{NAME}/health",
    json.dumps({"name": NAME, "online": False, "ts": now_iso()}),
    qos=1,
    retain=True,
)

def on_connect(c, u, flags, rc):
    c.subscribe("home/+/+/command", qos=1)
    publish_health()

def on_message(c, u, msg):
    parts = msg.topic.split("/")
    if len(parts) != 4 or parts[3] != "command":
        return
    _, room, device, _ = parts
    cmd = json.loads(msg.payload)
    # 1. filter / 2. validate / 3. call native / 4. publish state

def publish_health():
    client.publish(
        f"home/_meta/adapter/{NAME}/health",
        json.dumps({
            "ts": now_iso(),
            "name": NAME,
            "version": VERSION,
            "uptime_s": int(time.time() - started_at),
        }),
        qos=1,
        retain=True,
    )
```

## Configuration

Each adapter reads which rooms/devices it owns from a shared `config/house.yaml`. Devices in the house definition declare an `adapter` field:

```yaml
rooms:
  living_room:
    devices:
      music:
        adapter: sonos
        sonos_zone: "Living Room"
      lights:
        adapter: control4
        c4_proxy_id: 123
```

The adapter loads `house.yaml` on startup, filters to entries matching its `name`, and subscribes only to those topics.

## Testing locally

```bash
# tail every MQTT message
mosquitto_sub -h localhost -t 'home/#' -v

# send a synthetic command
mosquitto_pub -h localhost \
  -t home/living_room/music/command \
  -m '{"id":"test-1","op":"pause","args":{}}'
```

## Submitting a new adapter

1. Add it to `config/house.yaml` under the devices it owns.
2. Add a process entry (systemd unit on Linux, `launchd.plist` on macOS).
3. Verify health appears in `home/_meta/adapter/{name}/health`.
4. Run the orchestrator's smoke test (Phase 1+): `pnpm test:adapter {name}`.
