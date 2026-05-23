# Control4 adapter

Bridges Control4 to the Home Brain MQTT bus.

## Install

```bash
cd adapters-py/control4
pip install -e .
```

## Run

```bash
# Mock (default): in-memory simulator, no C4 hardware required
python -m home_brain_control4.main

# Real: against pyControl4 — fill in the stub in pycontrol4_backend.py first
CONTROL4_MODE=real python -m home_brain_control4.main
```

Environment variables:

| Var | Default | Notes |
|---|---|---|
| `CONTROL4_MODE` | `mock` | `mock` or `real` |
| `MQTT_URL` | `mqtt://localhost:1883` | Broker URL |
| `HOUSE_YAML` | (auto-detect) | Path to `config/house.yaml` (falls back to `config/house.example.yaml`) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warning` / `error` |

## Topics

- Subscribes:
  - `home/{room}/lights/command` for every room with `lights.adapter == control4`
  - `home/{room}/c4/command` and `home/_house/c4/command` for `run_c4_scene`
- Publishes (retained):
  - `home/{room}/lights/state` — `{ on, brightness, scene }`
  - `home/{room}/c4/state` / `home/_house/c4/state` — `{ last_scene, last_scene_at, last_room }`
  - `home/_meta/adapter/control4/health` every 15s, with MQTT LWT

## Real backend (Mac mini only)

The `pycontrol4_backend.py` stub raises `NotImplementedError`. To activate:

1. `pip install pyControl4`
2. Implement the methods against `C4Director` / `C4Light` / `C4Account` per the [pyControl4 docs](https://github.com/lawtancool/pyControl4)
3. Refresh the director bearer token every 86,400 seconds
4. Subscribe to the C4 WebSocket and call `on_external_light_change` for keypad / app changes
