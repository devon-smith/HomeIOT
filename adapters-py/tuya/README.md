# Tuya adapter

Bridges Tuya / Smart Life devices on the LAN to the Home Brain MQTT bus.

Handles two device kinds (declared in `house.yaml` under each device's
`config.kind`):

- **climate** — `set_target` / `set_mode`; publishes `{mode, target_f,
  current_f, heating}` (e.g. sauna)
- **switch** — `set` with `{on: bool}`; publishes `{on}` (e.g. fountain,
  miscellaneous WiFi switches)

If `kind` is omitted, it's inferred from the device slug: `sauna`,
`hot_tub`, `pool`, `hvac` → climate; everything else → switch.

## Install

```bash
cd adapters-py/tuya
pip install -e .
```

## Run

```bash
# Mock (default): in-memory simulator
python -m home_brain_tuya.main

# Real: against tinytuya — fill in the stub in tinytuya_backend.py first
TUYA_MODE=real python -m home_brain_tuya.main
```

Environment variables:

| Var | Default | Notes |
|---|---|---|
| `TUYA_MODE` | `mock` | `mock` or `real` |
| `MQTT_URL` | `mqtt://localhost:1883` | Broker URL |
| `HOUSE_YAML` | (auto-detect) | Path to `config/house.yaml` (falls back to `config/house.example.yaml`) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warning` / `error` |

## Real backend (Mac mini only)

The `tinytuya_backend.py` stub raises `NotImplementedError`. To activate:

1. `pip install tinytuya`
2. Run `tinytuya wizard` once to extract per-device `device_id` and
   `local_key` from the Tuya IoT Cloud. Store them in `house.yaml` under
   each device's `config:` block.
3. Implement against `tinytuya.OutletDevice` / `tinytuya.Device` per the
   [tinytuya docs](https://github.com/jasonacox/tinytuya). The DP map is
   sauna-specific — use `device.detect_available_dps()` to discover IDs.
4. Subscribe to LAN broadcasts on UDP 6666/6667 for external state
   changes from physical toggles.

Network requirements:

- UDP 6666, 6667, 7000 inbound for device announcements
- TCP 6668 outbound for device commands
- Local key rotates only on device factory reset; document the recovery
  procedure (re-run `tinytuya wizard`).
