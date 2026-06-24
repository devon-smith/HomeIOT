# Tuya integration — fountains, outdoor lights, sauna

How to bring the GHome / Tuya devices (fountains, tree lights, outdoor
lights, sauna, etc.) onto the brain's voice + dashboard control surface.

## Background

GHome (Gosund Home) is a rebranded Tuya Smart Life app. The devices
live on Tuya's cloud platform; GHome is just one UI on top of it. The
brain talks to these devices via **tinytuya**, a Python library that
controls Tuya devices directly over the LAN — no cloud round-trip, no
GHome app dependency.

**You don't need to remove devices from GHome.** Local LAN control
runs alongside cloud control. GHome keeps working; we get a parallel
control path with sub-second latency.

What we DO need: per-device credentials (`device_id` + `local_key`)
extracted via Tuya's developer cloud. That's a one-time ~30-minute
setup.

## Scope (priority order)

| Priority | Devices | Tool / kind | Notes |
|---|---|---|---|
| **P1** | Fountains (backyard, etc.) | `set_water_feature` / switch | Simple on/off; biggest immediate win |
| **P2** | Outdoor smart-plug lights (tree lights, landscape) | `set_lights` / switch | If they're WiFi smart plugs vs Control4 |
| **P3** | Sauna | `set_climate` / climate | Per-device DP mapping required; biggest payoff |
| **P4** | Indoor Tuya devices | depends on device kind | Punt until P1-P3 are solid |

## Phase 1 — Accept the invite + take inventory (you do, ~15 min)

1. Download **GHome** from the App Store (link in Andy's invite).
2. Open GHome → **My** → **Home Management** → **Join Home** → enter code
   **`VFBHRN`** before it expires (Andy said 3 days).
3. Once joined, open the **Devices** tab. Take inventory — for each
   device, note:
   - Display name (e.g. "Backyard Fountain")
   - Device kind (light? smart plug? sauna controller? misc?)
   - Where it physically lives (which house room/zone)
   - Whether it's outdoor or indoor

4. Paste the inventory back to me. Format suggestion:

```
- "Backyard Fountain" — smart plug — backyard — outdoor
- "Tree Lights" — smart plug — front gate — outdoor
- "Sauna" — climate controller — sauna room — indoor
- ...
```

## Phase 2 — Tuya IoT Cloud account + credentials (~20 min, one-time)

The `tinytuya wizard` tool walks you through this. Once done, every
device gets a `device_id` + `local_key` we plug into `house.yaml`.

On the Mac mini:

```
cd ~/code/HomeIOT/adapters-py/tuya
~/code/HomeIOT/.venv/bin/pip install tinytuya
~/code/HomeIOT/.venv/bin/python -m tinytuya wizard
```

The wizard will ask you to:

1. **Create a Tuya IoT Cloud developer account** (free).  
   Go to `iot.tuya.com` → sign up. Use any email.

2. **Create a Cloud project**. The wizard tells you which options to
   pick. Region: **Americas / West (US-WST)** since your devices are
   in California.

3. **Link the GHome account to the project.** In the Tuya IoT Cloud
   UI: **Cloud → Development → [Your Project] → Devices tab → Link
   Tuya App Account**. Scan the QR code with the GHome app's profile
   screen. Tuya pulls the device list into your dev project.

4. **Run `tinytuya wizard` again** with your API ID + secret. It
   queries Tuya cloud, dumps every device with its `device_id` and
   `local_key` to a local file (`devices.json` and `tuya-raw.json`).

5. Paste the wizard output (the table it prints, NOT `tuya-raw.json`
   which has secrets) back to me with the same room mapping from
   Phase 1.

## Phase 3 — I implement the tinytuya backend (~3 hours, after Phase 2)

Once we have credentials, I:

1. Implement `TinyTuyaBackend` in `adapters-py/tuya/home_brain_tuya/tinytuya_backend.py` — replace the `NotImplementedError` stubs:
   - `init()`: build a `tinytuya.OutletDevice` per switch, `tinytuya.Device` per climate
   - `get_state()`: poll status, return SwitchState/ClimateState
   - `set_on()`: dispatch DP 1 = bool
   - `set_target()` / `set_mode()`: per-device DP discovery via `detect_available_dps()`
   - `on_external_change()`: subscribe to UDP 6666/6667 broadcasts
2. Add LAN port allowances if any firewall rules block UDP 6666/6667.
3. Verify on a single test device (probably a fountain — simplest).

## Phase 4 — Wire devices into house.yaml (~10 min per device)

Per device, add a block under the appropriate room:

```yaml
backyard:
  label: Backyard
  devices:
    # existing music/hot_tub/pool entries stay
    fountain:
      adapter: tuya
      config:
        kind: switch
        tuya_id: "abc123def456"            # from wizard
        local_key: "xxxxxxxxxxxxxxxx"      # from wizard
        label: "Backyard Fountain"
```

For the sauna (climate-kind):

```yaml
sauna:
  label: Sauna
  devices:
    sauna:
      adapter: tuya
      config:
        kind: climate
        tuya_id: "..."
        local_key: "..."
        dp_target: 2         # DP id for target temp (discovered via detect_available_dps)
        dp_current: 3
        dp_mode: 4
        # We'll figure out the DP map together once the device is reachable.
```

For outdoor smart-plug lights — treat as switches initially:

```yaml
front_gate:
  devices:
    tree_lights:
      adapter: tuya
      config:
        kind: switch
        tuya_id: "..."
        local_key: "..."
        label: "Tree Lights"
```

These map naturally to voice phrases the planner already understands:

- *"Alexa, ask natasha brain to turn on the backyard fountain"*
- *"...turn on the tree lights"*
- *"...warm the sauna to 180"*

## Phase 5 — Dashboard surfaces (~30 min)

After devices are reporting state, the dashboard gets minor additions:

1. **Sauna ring** on Spaces page — already scaffolded (currently says
   "wire when ready" — just swap out the placeholder).
2. **Water feature row** on Backyard/Outdoor spaces.
3. **Tuya outdoor lights** appear in the Lighting tab's outdoor section
   automatically (existing code groups any `lights` device per
   `zones.outdoor`).
4. **Activity feed** translations — already covers `fan` and `lights`
   kinds; switch/water-feature need 2 lines added.

## Risks / known gotchas

- **Local key rotation:** Tuya rotates `local_key` only on factory
  reset. If a device is reset, re-run `tinytuya wizard` to refresh.
- **GHome unlinking:** if Andy ever removes you from the home in
  GHome, your tinytuya credentials still work — devices are
  cloud-tied but locally controllable. You'd lose GHome app access
  but not brain control.
- **Sauna DP discovery:** climate devices have model-specific DP
  maps. Plan an hour to figure out which DP controls target temp,
  current temp, on/off, mode for your specific sauna controller.
- **Outdoor lights may not be WiFi:** if "tree lights" are smart-plug
  controlled (very likely — outdoor smart plugs are common), they're
  switches. If they have native WiFi + dimming/color, we need a
  third device kind. We'll know once you do the inventory.
- **Firewall:** the Mac mini needs to receive UDP on 6666/6667. If
  the LAN firewall blocks broadcast, external state changes (someone
  toggling a fountain via GHome) won't reflect on the brain. Most
  home networks pass these by default.

## Quick decision: do this now or after the trip?

| If you want it before you leave | Estimate |
|---|---|
| Phase 1 (inventory) + Phase 2 (wizard) tonight | ~45 min you do |
| Phase 3 (backend implementation) | ~3 hours I do |
| Phase 4 (wire devices) — 1 fountain only | ~10 min |
| **= working voice control of the backyard fountain by end of evening** | ~4 hours total |

| If you'd rather punt for now | Estimate |
|---|---|
| Phase 1 tonight (just so we know scope) | ~15 min |
| Everything else after the trip | — |

Recommend the second path unless the fountains are a major friction
point right now. The Sonos curation + Routines wrap-up are higher-
leverage and you're closer to the finish line on them.
