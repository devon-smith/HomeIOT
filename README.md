# Home Brain

Local-first natural-language home control. Type "warm the hot tub for 9pm" and it happens.

This is the orchestration layer that unifies Control4, Sonos, iAquaLink, Tuya, and other smart-home devices behind a single LLM-powered interface. Runs on a Mac mini on the home LAN.

## Read first

- [PROJECT_REPORT.md](./PROJECT_REPORT.md) — strategy, goals, architecture, build plan. Start here.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — technical deep-dive on the five-layer design and data flow.
- [ROADMAP.md](./ROADMAP.md) — milestone roadmap (6-18 month view).
- [docs/MQTT_TOPICS.md](./docs/MQTT_TOPICS.md) — the canonical topic schema everything publishes to.
- [docs/TOOL_SCHEMA.md](./docs/TOOL_SCHEMA.md) — the tool interface Claude sees.
- [docs/ADAPTER_GUIDE.md](./docs/ADAPTER_GUIDE.md) — how to write a new device adapter.

## Quick start

```bash
# bring up the supporting services
docker compose up -d

# install deps and generate Prisma client
pnpm install
pnpm prisma migrate dev

# run the brain (separate terminal)
pnpm dev

# run the sonos adapter — SONOS_MODE=mock simulates a Sonos for testing;
# omit it (or set SONOS_MODE=real) to talk to a real Sonos system
SONOS_MODE=mock pnpm sonos

# scan your LAN for devices
pnpm discover

# send a message — fast-path works without an API key;
# free-text requires ANTHROPIC_API_KEY set in .env
curl -X POST http://localhost:3000/message \
  -H 'content-type: application/json' \
  -d '{"text": "pause music in the living room"}'
```

## Sandbox verification

`pnpm smoke` spins up an in-process MQTT broker (aedes), starts the Sonos
adapter in mock mode, and verifies the command → state echo round-trip. No
Docker, no Anthropic key, no Sonos hardware required — useful for CI and
quick local sanity checks.

`pnpm test` runs the classifier + normalizer unit tests.

## Repo layout

```
home-brain/
├── PROJECT_REPORT.md          strategic doc — the source of truth
├── ARCHITECTURE.md            technical architecture
├── docker-compose.yml         mosquitto + postgres + redis
├── prisma/                    schema and migrations
├── src/                       TypeScript brain
│   ├── core/                  bus, world model, db, logging
│   ├── adapters/              TS-native adapters (sonos, tv)         [phase 1+]
│   ├── intent/                router, classifier, claude planner     [phase 1+]
│   ├── scenes/                composed multi-device actions          [phase 2+]
│   ├── interfaces/            http, imessage, web                    [phase 1+]
│   └── server.ts              entry point
├── adapters-py/               Python adapters (control4, iaqualink, tuya) [phase 2+]
├── config/                    house definition + brain-owned scenes
├── scripts/                   discovery, one-off ops tools
└── docs/                      protocol docs and adapter guide
```

## Status

**Phase 0 — Foundation.** Stack scaffolded, broker/db/cache configured, Prisma schema in place, discovery script ready. See `PROJECT_REPORT.md` §6 for the phased build plan.

## License

Private — not for redistribution.
