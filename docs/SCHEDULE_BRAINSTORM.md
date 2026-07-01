# P17 — Non-routine scheduled tasks (brainstorm)

A scratch list of scheduled tasks worth adding beyond the daily routines
(*goodnight*, *good morning*, sunrise/sunset triggers). These are
*conditional*, *event-driven*, or *one-shot* — things the current
scheduler **can** model but we haven't surfaced. Pick the ones you'd
actually use; each becomes a `schedule_action` invocation (manual or via
a brain-side rule).

## Buckets

### A. House-state guardrails (run periodically, act only on a trigger)

The scheduler fires these on a clock, but the action is a no-op unless
the world state matches. Each is one daily or hourly `schedule_action`
with `recurrence: daily`.

| Idea | Why | Sketch |
|---|---|---|
| **Lights-on-after-bedtime check** | Lights left on after 1am drift to your bedroom | 01:00 daily — if any lights still on, dim to 10% then off |
| **Garage / front gate at midnight** | Catch forgotten outdoor lights | 00:00 daily — turn off main house perimeter + pool area |
| **Hot tub auto-off** | Forget the tub on, gas burns all night | every 2h — if tub heating and no one home (Geofence v2), turn off |
| **Empty-room music sweep** | Sonos in oasis_palms playing to no one | 23:00 daily — if music playing in outdoor zones, pause |
| **Skylight close at sunset** | Forgot to close after a sunny afternoon | sunset −15m — if any skylight open, close it |
| **AV idle reaper** | Theater left powered on after movie | every 4h — if theater AV on for 4+ hours w/ no source change, turn off |

### B. Comfort prep (run ahead of typical activities)

| Idea | Why | Sketch |
|---|---|---|
| **Morning bathroom warm** | Master bath cold in winter mornings | weekdays 06:45 — set master bedroom HVAC to 72 |
| **Returning-home preheat** | Tub ready when you're outside at 5pm | weekdays 16:30 — warm hot tub to 102 (Apr–Oct) |
| **Theater pre-cool** | AC catches up before movie night | weekends 19:30 — cool downstairs HVAC to 70 |
| **Dinner ambiance** | Kitchen dim + jazz when cooking starts | weekdays 18:00 — dim kitchen 40 + play dinner jazz |
| **Weekend wake** | No 6am alarm Sat/Sun | weekends 08:30 — run "good morning" |

### C. Recurring chores (announce-only, no devices)

These need an "announce" tool (TTS via a Sonos zone) — not yet built.
Listed so we don't lose the idea.

| Idea | Sketch |
|---|---|
| **Trash night reminder** | Sunday 20:00 — announce in kitchen "trash out tonight" |
| **Pool chemicals** | Wed 09:00 — announce in pool house |
| **Filter change cadence** | First-of-month 09:00 — announce |
| **Calendar peek** | weekdays 07:30 — read today's calendar (needs Google Calendar adapter) |

### D. Seasonal toggles (one-shot per season)

| Idea | Sketch |
|---|---|
| **Hot tub winter mode** | Nov 1 — daily 15:00 warm to 102 (default off rest of year) |
| **Pool summer mode** | May 15 — daily 14:00 warm to 85 (default off rest of year) |
| **Holiday lights** | Dec 1 — sunset turn on terrace + front gate; cancel Jan 6 |
| **Outdoor music seasonal default** | May–Oct — backyard volume bumped from 35 to 45 |

### E. Reactive (event-driven, not time-driven)

These need MQTT event subscriptions — not pure schedules. The scheduler
*could* poll for them on a tight interval as a stopgap.

| Idea | Trigger | Action |
|---|---|---|
| **Solar over-temp protect** | upstairs HVAC reads > 88° | turn off skylight blinds, pull shades (need adapter) |
| **Power outage recovery** | brain reboots after >30s downtime | run "soft restore" — restore prev light states from last snapshot |
| **TV power = lights dim** | theater AV → on | dim theater to 8% |
| **TV power = lights restore** | theater AV → off, post-21:00 | restore theater to 40% |
| **Music in master = HVAC down** | master bedroom music starts after 22:00 | set HVAC zone to night setpoint |

### F. Maintenance / observability

| Idea | Sketch |
|---|---|
| **Daily usage digest** | 09:00 daily — log yesterday's Claude spend to console (already on /api-usage but not pushed) |
| **Adapter health alert** | every 5m — if any adapter heartbeat stale > 2m, log + (later) text |
| **Schedule sanity** | 03:00 daily — log next-24h pending jobs so you know what's coming |

## How to pick

Start small — pick **2–3 from buckets A and B** and let them run for a
week. If they're not noticeably useful, kill them. If they are, layer in
more. Avoid bucket E until we have a real event-driven layer (the
polling stopgap will pile up Claude calls).

Order I'd suggest for v0.1:
1. **Lights-on-after-bedtime check** — cheap, immediately useful.
2. **Skylight close at sunset** — recurring annoyance you've mentioned.
3. **Dinner ambiance** — the highest-utility comfort routine.
4. **Returning-home tub preheat** — high payoff if your schedule is regular.

## Mechanics — how to wire each one

Each entry above lands as one `schedule_action` invocation. Examples
(send via voice or paste into the dashboard NL bar):

```
ask smart home to dim the house to 10% then off every day at 1am
ask smart home to warm the hot tub to 102 every weekday at 4:30pm
ask smart home to dim the kitchen to 40 and play dinner jazz at 6pm on weekdays
ask smart home to close all skylights 15 minutes before sunset
```

The planner translates each into a `schedule_action({when, recurrence,
actions})` and the BullMQ scheduler persists it across reboots. Cancel
with *"cancel the hot tub warm"* (`label_match`) or via the dashboard
schedule chips.

## Open follow-ups

- **Geofence / presence**: A few of these (hot tub auto-off, theater
  reaper) really want presence data. Easiest source: a Home Assistant
  presence sensor proxied through MQTT, or an iCloud Find-My adapter.
- **Announce tool**: a `say({zone, text})` tool that ducks current music
  and speaks via Sonos. Half-day of work; unblocks bucket C.
- **Conditional schedules**: today the scheduler fires unconditionally
  and the action's tool checks state. A `condition: { device: ..., state:
  ... }` clause on `schedule_action` would let the scheduler skip the
  no-op LLM call entirely. Worth doing once we accumulate 10+ guardrails.
