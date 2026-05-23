# iAquaLink adapter

Bridges Jandy/Zodiac iAquaLink (cloud) to the Home Brain MQTT bus.

## Install

```bash
cd adapters-py/iaqualink
pip install -e .
```

## Run

```bash
# Mock (default): in-memory simulator with a simple heating curve
python -m home_brain_iaqualink.main

# Real: against iaqualink-py — fill in the stub in iaqualink_backend.py first
IAQUALINK_MODE=real \
IAQUALINK_EMAIL=you@example.com \
IAQUALINK_PASSWORD=... \
python -m home_brain_iaqualink.main
```

Environment variables:

| Var | Default | Notes |
|---|---|---|
| `IAQUALINK_MODE` | `mock` | `mock` or `real` |
| `IAQUALINK_EMAIL` | — | Required when `real` |
| `IAQUALINK_PASSWORD` | — | Required when `real` |
| `MQTT_URL` | `mqtt://localhost:1883` | Broker URL |
| `HOUSE_YAML` | (auto-detect) | Path to `config/house.yaml` (falls back to `config/house.example.yaml`) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warning` / `error` |

## Topics

- Subscribes: `home/{room}/{device}/command` for every `(room, device)` in
  `house.yaml` with `adapter == iaqualink` (typically `hot_tub` and `pool`).
- Publishes (retained): `home/{room}/{device}/state` — `{ mode, target_f,
  current_f, heating }`.
- Heartbeat: `home/_meta/adapter/iaqualink/health` every 15s, with LWT.

## Real backend (Mac mini only)

The `iaqualink_backend.py` stub raises `NotImplementedError`. To activate:

1. `pip install iaqualink`
2. Use `iaqualink.AqualinkClient` to authenticate, fetch systems, and call
   `set_temperature` / `set_aux` / etc. per the
   [iaqualink-py docs](https://github.com/flz/iaqualink-py).
3. Run a 20-30s poll loop calling `system.update()` and publish diffs.
4. Respect the library's built-in 429 backoff.
