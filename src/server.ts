import Fastify from "fastify";
import { config } from "./config.js";
import { log } from "./core/log.js";
import { Bus } from "./core/bus.js";
import { World } from "./core/world.js";
import { connectDb, disconnectDb, prisma } from "./core/db.js";
import { loadHouse } from "./core/house.js";
import { loadScenes } from "./core/scenes.js";
import { BullMQScheduler, MemoryScheduler, type Scheduler } from "./core/scheduler.js";
import { sharedRedis, closeSharedRedis } from "./core/redis.js";
import { verifyHmac } from "./auth/hmac.js";
import { type Source } from "./auth/source-authz.js";
import { Router, ToolRegistry, registerTools, ClaudePlanner } from "./intent/index.js";
import { type Planner } from "./intent/planner.js";
import { recordApiCall, summarize, recent, totals } from "./core/api-metrics.js";
import { DASHBOARD_HTML } from "./web/dashboard.js";
import { handleVoiceInterpret } from "./voice/interpret.js";

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

  // Scheduler: BullMQ if Redis + REDIS_URL is set (durable across reboots),
  // otherwise in-memory (process-lifetime only). Reads location from
  // house.yaml for sunrise/sunset triggers.
  const execJob = async (job: { id: string; label?: string; actions: { tool: string; args: Record<string, unknown> }[]; actor: string }) => {
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
  };
  const scheduler: Scheduler = config.REDIS_URL
    ? new BullMQScheduler(execJob, config.REDIS_URL, house.location)
    : new MemoryScheduler(execJob, house.location);
  log.info({ kind: config.REDIS_URL ? "bullmq" : "memory" }, "scheduler ready");
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

  // PWA manifest — installable to iOS / Android / desktop home screen.
  app.get("/manifest.webmanifest", async (_req, reply) => {
    reply.type("application/manifest+json").send({
      name: "Home Brain",
      short_name: "Brain",
      description: "Local-first home control",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#15140f",
      theme_color: "#c8623a",
      icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icon-180.png", sizes: "180x180", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    });
  });

  // SVG icon (used for favicon + Apple touch icon + PWA install icon).
  // A burnt-orange disc with a stylized house glyph — kept inline so we
  // never have to ship binary assets.
  app.get("/icon.svg", async (_req, reply) => {
    reply.type("image/svg+xml").header("cache-control", "public, max-age=86400").send(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#c8623a"/>
  <path d="M120 260 L256 144 L392 260 L392 392 Q392 408 376 408 L296 408 L296 312 L216 312 L216 408 L136 408 Q120 408 120 392 Z" fill="#fff" opacity="0.95"/>
  <circle cx="256" cy="232" r="14" fill="#c8623a"/>
</svg>`,
    );
  });

  // Minimal service worker — enables PWA install + offline-tolerant
  // shell. We don't aggressively cache state endpoints; they go straight
  // to network so live data always wins.
  app.get("/sw.js", async (_req, reply) => {
    reply.type("application/javascript").header("cache-control", "no-cache").send(
      `const CACHE='home-brain-v1';
const SHELL=['/','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Live data: network only, no cache.
  if (['/world','/events','/schedule','/house','/message','/healthz'].some(p => url.pathname.startsWith(p))) return;
  // Shell: cache-first.
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});`,
    );
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
      starred_playlists: house.preferences?.music?.starred_playlists ?? [],
    };
  });

  // GET /api-usage — Claude API call accounting for the dashboard's Usage tab.
  // Returns rolling-window summaries (today / 7d / lifetime since boot) plus
  // the most recent calls so the UI can list them. Reset on brain restart.
  app.get("/api-usage", async (req) => {
    const query = req.query as { limit?: string } | undefined;
    const limit = Math.min(200, Math.max(1, parseInt(query?.limit ?? "50", 10) || 50));
    const HOUR = 60 * 60 * 1000;
    return {
      windows: {
        last_hour: summarize(HOUR),
        last_24h: summarize(24 * HOUR),
        last_7d: summarize(7 * 24 * HOUR),
        since_boot: totals(),
      },
      pricing: {
        input_per_mtok: config.HB_PRICE_INPUT_PER_MTOK,
        output_per_mtok: config.HB_PRICE_OUTPUT_PER_MTOK,
        cache_write_per_mtok: config.HB_PRICE_CACHE_WRITE_PER_MTOK,
        cache_read_per_mtok: config.HB_PRICE_CACHE_READ_PER_MTOK,
      },
      recent: recent(limit),
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
          recurrence: j.recurrence ?? null,
          trigger: j.trigger ?? null,
        })),
    };
  });

  app.post("/schedule/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    await scheduler.cancel(id);
    pushEvent("schedule_cancelled", { job_id: id, by: "web" });
    reply.code(204).send();
  });

  app.post("/schedule/:id/snooze", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { by_minutes?: number } | undefined) ?? {};
    const by = body.by_minutes;
    if (typeof by !== "number" || by === 0) {
      reply.code(400);
      return { ok: false, message: "body.by_minutes (non-zero number) required" };
    }
    const updated = await scheduler.snooze(id, by);
    if (!updated) {
      reply.code(404);
      return { ok: false, message: "job not found or not pending" };
    }
    pushEvent("schedule_snoozed", { job_id: id, by_minutes: by, new_fire_at: updated.fireAt.toISOString() });
    return { ok: true, fireAt: updated.fireAt.toISOString() };
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
    trackUsage(result, body.text, actor);
    return {
      ok: result.results.every((r) => r.ok) || result.results.length === 0,
      route: result.route,
      response: result.response,
      latencyMs: result.latencyMs,
      toolCalls: result.toolCalls,
    };
  });

  function trackUsage(result: Awaited<ReturnType<typeof router.handle>>, text: string, actor: string) {
    const cs = result.cacheStats ?? {
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    recordApiCall({
      actor,
      route: result.route,
      text: text.length > 140 ? text.slice(0, 137) + "..." : text,
      toolCalls: result.toolCalls.length,
      latencyMs: result.latencyMs,
      cacheCreationInputTokens: cs.cacheCreationInputTokens,
      cacheReadInputTokens: cs.cacheReadInputTokens,
      inputTokens: cs.inputTokens,
      outputTokens: cs.outputTokens,
    });
  }

  // POST /interpret — voice-surface entrypoint (Alexa, Siri, future).
  // HMAC-signed, deduped via Redis on requestId, races the planner against
  // a deadline so the caller gets a spoken response within the voice SLA.
  // Returns {spoken, status, keepSessionOpen, reprompt} per the contract.
  app.post("/interpret", { preHandler: verifyHmac }, async (req) => {
    const body = req.body as {
      text?: string;
      source?: string;
      requestId?: string;
      sessionId?: string;
      userId?: string;
      deadlineMs?: number;
    } | undefined;

    const source = (body?.source ?? "alexa") as Source;
    if (body?.text && body.requestId) {
      log.info({ text: body.text, source, requestId: body.requestId }, "voice request");
    }
    return await handleVoiceInterpret(body, {
      router,
      reserveRequest: async (requestId, ttlMs) => {
        const fresh = await sharedRedis().set(`voice:req:${requestId}`, "1", "PX", ttlMs, "NX");
        if (fresh !== "OK") {
          log.info({ requestId, source }, "voice request deduplicated");
          return false;
        }
        return true;
      },
      trackUsage,
      pushEvent,
      logAsync: (requestId, r) => log.info({ requestId, latencyMs: r.latencyMs }, "voice async finished"),
      logAsyncError: (requestId, err) => log.warn({ requestId, err: err?.message }, "voice async failed"),
      voiceDeadlineMs: config.HB_VOICE_DEADLINE_MS,
      voiceTerse: config.HB_VOICE_TERSE,
      voiceKeepOpen: config.HB_VOICE_KEEP_OPEN,
    });
  });
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info({ port: config.PORT }, "http listening");

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    await app.close().catch(() => {});
    await scheduler.close().catch(() => {});
    await bus.disconnect().catch(() => {});
    await world.disconnect().catch(() => {});
    await closeSharedRedis().catch(() => {});
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
