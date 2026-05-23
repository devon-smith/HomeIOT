# Home Assistant decision — deferred

> Status: deferred. Revisit at the trigger conditions below.

## The question

`PROJECT_REPORT.md §5` lays out the build-vs-buy decision: should we run Home
Assistant as an adapter aggregator for the long-tail device families, or keep
building per-family adapters as we have through M0-M4 (Sonos, Control4,
iAquaLink, Tuya, TV)?

## Current position

**Defer. Keep building per-family adapters until a trigger condition fires.**

Through M4 the per-adapter pattern has held up well: every adapter is ~250
lines of boilerplate around a brand-specific library, mock backend included.
The interface contract is stable (`docs/ADAPTER_GUIDE.md`) and the smoke
test scales linearly — adding a new adapter family is a day of work and
adds one section.

The cost of HA-as-aggregator is real:
- YAML-driven configuration coupled to the wider TS/Prisma stack
- A second message bus to bridge (HA WebSocket ↔ our MQTT)
- A second source of truth for device state
- Operational footprint of a full HA appliance on the Mac mini
- Our state model becomes HA's, not ours

The HA payoff is real too, but only against integrations we don't already
have. Through M4 we have all the high-value ones.

## Trigger conditions for revisiting

Reopen the question when **any** of these become true:

1. **A new device family takes more than a week.** Through M0-M4 each
   adapter has been a day. The first device family that requires a week
   of effort (deep reverse-engineering, custom transport, awkward auth)
   is the signal that the per-family cost curve has changed.

2. **We need to add 3+ adapters in the same week.** If a renovation or new
   purchase drops 3-5 unrelated WiFi devices on the LAN, the per-family
   pattern becomes the bottleneck. HA's long-tail aggregation pays off.

3. **A vendor drops their local API.** If Sonos kills UPnP or C4 changes
   firmware in a breaking way, HA's community typically has a fix faster
   than we can produce one. Falling back to HA-via-bridge for that vendor
   becomes attractive.

4. **We want HA's UI for a specific use case.** If the M5 web dashboard or
   the M7 admin observability page needs something HA already does well
   (Lovelace cards, blueprints, device tracker maps), bridging may be
   cheaper than building.

## Lightweight integration we can do now

If the user wants HA to coexist *without* the aggregator commitment:

- Run HA on the Mac mini as an opt-in service (`docker compose --profile
  ha up -d` — not added yet, but a one-line addition to compose).
- Bridge HA's MQTT-Statestream integration to publish HA-tracked devices
  onto our bus under `home/_ha/{entity}/...`. We don't depend on it, but
  it's there for ad-hoc queries.
- Treat HA as a useful diagnostic surface, not a hard dependency.

If we want to defer this lightweight path too, that's fine — it's not
gating anything.

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-23 | Defer to per-family adapters | M4 shipped without needing HA. Adapter cost still linear. |

Update this table whenever revisiting the question.
