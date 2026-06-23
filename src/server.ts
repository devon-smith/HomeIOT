import Fastify from "fastify";
import { config } from "./config.js";
import { log } from "./core/log.js";
import { Bus } from "./core/bus.js";
import { World } from "./core/world.js";
import { connectDb, disconnectDb, prisma } from "./core/db.js";
import { loadHouse } from "./core/house.js";
import { loadScenes } from "./core/scenes.js";
import { MemoryScheduler, type Scheduler } from "./core/scheduler.js";
import { Router, ToolRegistry, registerTools, ClaudePlanner } from "./intent/index.js";
import { type Planner } from "./intent/planner.js";
import { DASHBOARD_HTML } from "./web/dashboard.js";

interface RecentEvent {
  ts: string;
  kind: string;
  payload: unknown;
}
const EVENT_RING_SIZE = 200;

async function main() {
  const house = loadHouse();
  log.info({ rooms: Object.keys(house.rooms).length, tz: house.timezone }, "house loaded");

  const scenes = loadScenes();
  log.info({ scenes: Object.keys(scenes).length }, "scenes loaded");

  const bus = new Bus();
  const world = new World();

  await Promise.all([bus.connect(), world.connect(), connectDb()]);

  // Ring buffer of recent state changes + events, surfaced by GET /events for the dashboard.
  const recentEvents: RecentEvent[] = [];
  const pushEvent = (kind: string, payload: unknown) => {
    recentEvents.push({ ts: new Date().toISOString(), kind, payload });
    if (recentEvents.length > EVENT_RING_SIZE) recentEvents.shift();
  };

  bus.onState((room, device, msg) => {
    world.setDeviceState(room, device, msg).catch((err) => log.error({ err, room, device }, "world write failed"));
    log.debug({ room, device, source: msg.source, pending: msg.pending }, "state update");
    pushEvent(`state:${room}/${device}`, { source: msg.source, pending: msg.pending, state: msg.state });
  });

  bus.onEvent((type, payload) => {
    log.debug({ type, payload }, "event");
    pushEvent(`event:${type}`, payload);
    // M5+: append to audit_log here.
  });

  const registry = new ToolRegistry();
  registerTools(registry);

  // In-memory scheduler. Swap for BullMQScheduler on the Mac mini for
  // reboot-durable scheduling (see src/core/scheduler.ts).
  const scheduler: Scheduler = new MemoryScheduler(async (job) => {
    const ctx = { bus, world, house, scenes, scheduler, registry, actor: job.actor };
    log.info({ jobId: job.id, label: job.label, actions: job.actions.length }, "scheduled job firing");
    for (const action of job.actions) {
      const result = await registry.run(action, ctx);
      log.info({ jobId: job.id, action: action.tool, ok: result.ok }, "scheduled action result");
      bus.publishEvent("schedule_fired", {
        job_id: job.id,
        fired_at: new Date().toISOString(),
        action: action.tool,
        ok: result.ok,
        message: result.message,
      });
    }
  });
  await scheduler.loadPending();

  let planner: Planner | null = null;
  if (config.ANTHROPIC_API_KEY) {
    planner = new ClaudePlanner({ registry, house, scenes, world }, config.ANTHROPIC_API_KEY);
    log.info({ model: config.ANTHROPIC_MODEL_DEFAULT }, "claude planner enabled");
  } else {
    log.warn("ANTHROPIC_API_KEY not set — falling back to fast-path-only routing");
  }

  const router = new Router({ bus, world, house, scenes, scheduler, registry, planner });

  const app = Fastify({ logger: false });

  app.get("/healthz", async () => {
    const dbStatus = await prisma.$queryRawUnsafe<unknown[]>("SELECT 1").then(
      () => "ok",
      () => "down",
    );
    return {
      brain: "ok",
      postgres: dbStatus,
      planner: planner ? "ready" : "disabled",
      ts: new Date().toISOString(),
    };
  });

  app.get("/", async (_req, reply) => {
    reply.type("text/html").send(DASHBOARD_HTML);
  });

  app.get("/world", async () => {
    return await world.snapshot();
  });

  app.get("/house", async () => {
    // Trimmed for the UI: room slugs/labels, device kinds, quick actions.
    const rooms: Record<string, { label: string; devices: string[] }> = {};
    for (const [slug, def] of Object.entries(house.rooms)) {
      rooms[slug] = { label: def.label, devices: Object.keys(def.devices) };
    }
    return {
      timezone: house.timezone,
      rooms,
      zones: house.zones,
      quick_actions: house.preferences?.quick_actions ?? [],
      moods: Object.keys(house.preferences?.music?.mood_playlists ?? {}),
      favorite_playlists: house.preferences?.music?.favorite_playlists ?? [],
    };
  });

  app.get("/events", async (req) => {
    const query = req.query as { limit?: string } | undefined;
    const limit = Math.min(EVENT_RING_SIZE, Math.max(1, parseInt(query?.limit ?? "50", 10) || 50));
    return { events: recentEvents.slice(-limit).reverse() };
  });

  app.get("/schedule", async () => {
    const jobs = await scheduler.list();
    return {
      jobs: jobs
        .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
        .map((j) => ({
          id: j.id,
          label: j.label,
          fireAt: j.fireAt.toISOString(),
          actor: j.actor,
          actions: j.actions,
        })),
    };
  });

  app.post("/schedule/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    await scheduler.cancel(id);
    pushEvent("schedule_cancelled", { job_id: id, by: "web" });
    reply.code(204).send();
  });

  app.post("/message", async (req, reply) => {
    const body = req.body as { text?: string; actor?: string } | undefined;
    if (!body?.text) {
      reply.code(400);
      return { ok: false, message: "missing 'text' field" };
    }
    const actor = body.actor ?? "owner";
    log.info({ text: body.text, actor }, "message received");
    const result = await router.handle(body.text, actor);
    log.info({ route: result.route, latencyMs: result.latencyMs }, "message handled");
    return {
      ok: result.results.every((r) => r.ok) || result.results.length === 0,
      route: result.route,
      response: result.response,
      latencyMs: result.latencyMs,
      toolCalls: result.toolCalls,
    };
  });

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "http listening");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    await app.close().catch(() => {});
    await scheduler.close().catch(() => {});
    await bus.disconnect().catch(() => {});
    await world.disconnect().catch(() => {});
    await disconnectDb().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  log.fatal({ err }, "fatal startup error");
  process.exit(1);
});
