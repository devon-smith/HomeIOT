import Fastify from "fastify";
import { config } from "./config.js";
import { log } from "./core/log.js";
import { Bus } from "./core/bus.js";
import { World } from "./core/world.js";
import { connectDb, disconnectDb, prisma } from "./core/db.js";
import { loadHouse } from "./core/house.js";
import { Router, ToolRegistry, registerM1Tools, ClaudePlanner } from "./intent/index.js";
import { type Planner } from "./intent/planner.js";

async function main() {
  const house = loadHouse();
  log.info({ rooms: Object.keys(house.rooms).length, tz: house.timezone }, "house loaded");

  const bus = new Bus();
  const world = new World();

  await Promise.all([bus.connect(), world.connect(), connectDb()]);

  bus.onState((room, device, msg) => {
    world.setDeviceState(room, device, msg).catch((err) => log.error({ err, room, device }, "world write failed"));
    log.debug({ room, device, source: msg.source, pending: msg.pending }, "state update");
  });

  bus.onEvent((type, payload) => {
    log.debug({ type, payload }, "event");
    // M5+: append to audit_log here.
  });

  const registry = new ToolRegistry();
  registerM1Tools(registry);

  let planner: Planner | null = null;
  if (config.ANTHROPIC_API_KEY) {
    planner = new ClaudePlanner({ registry, house, world }, config.ANTHROPIC_API_KEY);
    log.info({ model: config.ANTHROPIC_MODEL_DEFAULT }, "claude planner enabled");
  } else {
    log.warn("ANTHROPIC_API_KEY not set — falling back to fast-path-only routing");
  }

  const router = new Router({ bus, world, house, registry, planner });

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

  app.get("/world", async () => {
    return await world.snapshot();
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
