# Roadmap

Demo-driven milestone roadmap for Home Brain. Extends [PROJECT_REPORT.md §6](./PROJECT_REPORT.md) from a 6-week Phase plan into a 6-18 month view. Each milestone produces a user-visible change. Cross-cutting tracks run in parallel.

## M0 — Foundation
- Scope: Docker stack (Mosquitto + Postgres + Redis), Prisma schema, TS skeleton, LAN discovery
- Depends on: nothing
- Done when: `docker compose up && pnpm dev` connects everywhere; `pnpm discover` enumerates devices
- Risks: Mac mini Docker quirks (mDNS visibility from containers)

## M1 — Sonos end-to-end
- Scope: first vertical slice, Sonos adapter, fast-path classifier, POST /message, minimal Claude planner with set_music/query_state/run_scene
- Depends on: M0
- Done when: `curl -d "play jazz rock in the living room"` plays it in <2s with the actual track name in the response; "what's playing?" answers from world state
- Risks: Sonos UPnP eventing on S2; room-modeling mistakes that cost rework

## M2 — Control4 scenes + cross-vendor composition
- Scope: pyControl4 adapter, run_c4_scene, brain compositions in scenes.yaml, set_lights
- Depends on: M1
- Done when: "Movie night in the theater" fires the dealer's theater_movie scene AND drops Sonos volume in adjacent rooms to 10% in one user-visible action
- Risks: dealer coordination latency; C4 bearer-token refresh

## M3 — Pool, spa, sauna + scheduling
- Scope: iAquaLink + Tuya adapters, set_climate, BullMQ-backed schedule_action
- Depends on: M1, M0
- Done when: "Warm the hot tub for 9pm" survives a Mac mini reboot and fires correctly; "is the sauna ready?" returns real temperature
- Risks: iAquaLink rate-limiting; Tuya local-key recovery after factory reset

## M4 — TVs and the long tail (Home Assistant decision)
- Scope: HA-aggregator-vs-per-brand decision (informed by M1-M3 evidence), TV control, residual WiFi switches
- Depends on: M3
- Done when: "Movie night" includes the TV and right input; every controllable device responds to chat
- Risks: most likely milestone to under-deliver; honest scope-shrink to "TVs only" is acceptable

## M5 — Interface polish (iMessage + web)
- Scope: iMessage launchd bridge (sqlite tail of chat.db), Next.js diagnostic dashboard, approval-queue UI
- Depends on: M1, M3
- Done when: owner texts "play something chill" from the couch and it works; partner cancels a scheduled job from the web on their phone
- Risks: iMessage bridge fragility across macOS updates; dashboard scope creep

## M6 — Multi-actor identity + approval queue
- Scope: Actor table is runtime-managed; iMessage sender → actor resolution; house-sitter onboarding UI; approval queue end-to-end
- Depends on: M5
- Done when: a guest added via dashboard with 7-day expiry can use music/lights but is blocked from the hot tub with audit log per attempt
- Risks: permission semantics get debated more than implemented — lock from TOOL_SCHEMA §Permissions and ship

## M7 — Observability + planner eval set
- Scope: cache hit-rate, planner cost/latency telemetry, MQTT event tap, ~50-message eval set run nightly
- Depends on: M5, M1-M3 traffic
- Done when: /admin shows yesterday's planner $, p50/p95 by route, top 10 misclassified messages, regression diff if eval degraded
- Risks: eval set is the actual deliverable; dashboard is decoration. If eval isn't curated from real logs it's worthless

## M8 — Voice front-end (Whisper bridge)
- Scope: Whisper STT as third L5 interface, push-to-talk PWA + optional Mac mini hotword
- Depends on: M5, M7
- Done when: PTT on PWA + "warm the hot tub for 9" matches text path within +500ms
- Risks: exposes latency budget; if M7 shows planner p50 > 2s, voice feels bad — slip until after M9

## M9 — Learning from usage data
- Scope: auto-propose fast-path patterns from audit logs; predictive scheduling suggestions
- Depends on: M7
- Done when: dashboard surfaces 3+ proposed fast-path patterns; accepting one cuts latency from 1.5s → <100ms verified by eval set
- Risks: easy to over-engineer — keep human-in-the-loop

## M10 — Remote access via Tailscale
- Scope: Tailscale on Mac mini, dashboard on tailnet, ACL layered over actor model
- Depends on: M6
- Done when: owner on LTE opens dashboard, cancels a job, gets audit entry tagged with remote tailnet IP
- Risks: low; main risk is over-investing in security posture the threat model doesn't justify

## M11 — Cross-domain agent fleet integration
- Scope: home brain world model merges into broader knowledge graph; one chat surface routes across home / entertainment / Instagram; cross-domain scenes
- Depends on: M2, M5, external project readiness
- Done when: "movie night with the doc I saved yesterday" fires theater scene AND queues the right Instagram-saved video on the Apple TV in one action
- Risks: external timeline coupling; 1-week spike first, then commit or defer

## M12 — Proactive + ambient (stretch)
- Scope: anomaly detection, ambient suggestions, camera presence; always proposes via approval queue
- Depends on: M6, M7, M9
- Done when: 11pm iMessage: "sauna's been on since 6pm — leave it, or turn it off?" and one-word reply does the right thing
- Risks: where the system goes from useful to annoying if signal:noise is off; ship behind per-actor opt-in; easy to drop if M9 data is thin

---

## Cross-cutting tracks

- **Observability & telemetry** — grows from "exists" (M1) → "is a dashboard" (M7) → "drives learning" (M9)
- **Planner quality / eval set** — seeded informally at M1, formalized at M7, gates every planner change after
- **Security posture** — permissions (M0), actor model (M6), Tailscale (M10), approval queue (M5/M6); threat model stays LAN/tailnet, never internet-exposed
- **Adapter durability** — heartbeats, retained-state recovery, vendor-API drift monitoring; ~10% of weekly cycles after M3

## Dependency graph

```
M0 ──► M1 ──► M2 ──► M4 ──► M5 ──► M6 ──► M10
            │             │      │       └► M11
            └► M3 ────────┘      ├► M7 ──► M9 ──► M12
                                 └► M8
```

M1 is the bottleneck for everything except M0. M5 is the second bottleneck — voice (M8), learning (M9), proactive (M12), and remote (M10) all depend on either the web UI or actor model that M5/M6 establish. M7's eval set should land before M8/M9.

## Milestones to be honest about

- M4 may shrink to "TVs only, defer the long tail" — that's fine
- M8 voice may not be worth doing if M7 shows planner p50 > 2s
- M11 cross-domain is gated on external projects; spike-then-decide
- M12 ambient is the most-likely-to-quietly-drop milestone — depends on M9 surfacing real patterns
