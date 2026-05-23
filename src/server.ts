import Fastify from "fastify";
import { config } from "./config.js";
import { log } from "./core/log.js";
import { Bus } from "./core/bus.js";
import { World } from "./core/world.js";
import { connectDb, disconnectDb, prisma } from "./core/db.js";
import { loadHouse } from "./core/house.js";

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
    // Phase 1+: append to audit_log here.
  });

  const app = Fastify({ logger: false });

  app.get("/healthz", async () => {
    const adapterHealth = await prisma.$queryRawUnsafe<unknown[]>("SELECT 1").then(
      () => "ok",
      () => "down",
    );
    return { brain: "ok", postgres: adapterHealth, ts: new Date().toISOString() };
  });

  app.get("/world", async () => {
    return await world.snapshot();
  });

  app.post("/message", async (req, reply) => {
    // Phase 1: intent classification + Claude planner go here.
    const body = req.body as { text?: string } | undefined;
    if (!body?.text) {
      reply.code(400);
      return { ok: false, message: "missing 'text' field" };
    }
    log.info({ text: body.text }, "message received");
    return { ok: true, message: "Phase 0 stub — intent pipeline lands in Phase 1.", echo: body.text };
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
