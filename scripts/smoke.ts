/**
 * End-to-end smoke test for M1 + M2 + M3 wiring — no Docker, no real
 * hardware, no Anthropic key required.
 *
 * Spins up an in-process MQTT broker via aedes, starts the Sonos (TS),
 * Control4 (Python), iAquaLink (Python), and Tuya (Python) adapters as
 * subprocesses, all in mock mode, then verifies:
 *
 *   §A  Sonos wire — play → state echo with _cmd_id; pause
 *   §B  Control4 wire — set_lights and run_c4_scene; state echoes
 *   §C  Scene engine — runs the brain composition "movie_night" through
 *       the real Bus + ToolRegistry; both adapters confirm receipt
 *   §D  Climate wire — set hot_tub target (iAquaLink) and sauna target
 *       (Tuya climate); state echoes include current_f, target_f, heating
 *   §E  Scheduling — schedule_action fires a future set_climate via the
 *       in-memory MemoryScheduler; assertion verifies the scheduled action
 *       actually reached the iAquaLink adapter
 *
 * Does not exercise: Claude planner, Postgres, Redis, BullMQ durability.
 * Run locally with `docker compose up` + `pnpm dev` for the full stack
 * demo.
 */

import { Aedes } from "aedes";
import { createServer, type Server, type Socket } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import mqtt, { type MqttClient } from "mqtt";
import { v4 as uuid } from "uuid";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { Bus } from "../src/core/bus.js";
import { loadHouse } from "../src/core/house.js";
import { loadScenes } from "../src/core/scenes.js";
import { MemoryScheduler } from "../src/core/scheduler.js";
import { ToolRegistry, registerTools } from "../src/intent/index.js";
import { type World } from "../src/core/world.js";

const BROKER_PORT = 21883;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

interface Awaiter<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
}
function awaiter<T>(): Awaiter<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const failures: string[] = [];
function assert(label: string, cond: boolean): void {
  if (cond) console.log(`[smoke]  ✓ ${label}`);
  else {
    console.log(`[smoke]  ✗ ${label}`);
    failures.push(label);
  }
}

async function waitState(
  client: MqttClient,
  topic: string,
  matchCmdId: string,
  timeoutMs: number,
): Promise<{ _cmd_id: string | null; state: Record<string, unknown> }> {
  const a = awaiter<{ _cmd_id: string | null; state: Record<string, unknown> }>();
  const handler = (t: string, payload: Buffer) => {
    if (t !== topic) return;
    const msg = JSON.parse(payload.toString());
    if (msg._cmd_id === matchCmdId) a.resolve(msg);
  };
  client.on("message", handler);
  try {
    return await Promise.race([
      a.promise,
      sleep(timeoutMs).then(() => Promise.reject(new Error(`state echo timeout on ${topic} for cmd ${matchCmdId}`))),
    ]);
  } finally {
    client.off("message", handler);
  }
}

async function main() {
  const log = (...args: unknown[]) => console.log("[smoke]", ...args);

  const broker = await Aedes.createBroker();
  const server: Server = createServer((sock: Socket) => broker.handle(sock));
  await new Promise<void>((r) => server.listen(BROKER_PORT, r));
  log("broker listening on", BROKER_PORT);

  const subprocesses: ChildProcess[] = [];
  let client: MqttClient | null = null;
  let bus: Bus | null = null;
  let exitCode = 0;

  // Write a scenes fixture matched to the example house: theater + adjacent
  // living_room/kitchen, used by section §C.
  const scenesPath = path.join(os.tmpdir(), `smoke-scenes-${Date.now()}.yaml`);
  fs.writeFileSync(
    scenesPath,
    `scenes:
  movie_night:
    name: Movie Night
    description: Theater AV via C4 + drop music in adjacent rooms.
    rooms: [theater]
    actions:
      - tool: run_c4_scene
        args: { name: theater_movie, room: theater }
      - tool: set_music
        args: { room: living_room, volume: 10 }
      - tool: set_music
        args: { room: kitchen, volume: 10 }
`,
    "utf8",
  );

  try {
    // Spawn TS Sonos adapter
    const sonos = spawn("pnpm", ["sonos"], {
      cwd: ROOT,
      env: { ...process.env, MQTT_URL: `mqtt://localhost:${BROKER_PORT}`, SONOS_MODE: "mock", LOG_LEVEL: "info" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    sonos.stdout?.on("data", (d) => process.stdout.write(`[sonos] ${d}`));
    sonos.stderr?.on("data", (d) => process.stderr.write(`[sonos] ${d}`));
    subprocesses.push(sonos);

    // Spawn Python Control4 adapter
    const c4 = spawn("python3", ["-u", "-m", "home_brain_control4.main"], {
      cwd: path.join(ROOT, "adapters-py/control4"),
      env: { ...process.env, MQTT_URL: `mqtt://localhost:${BROKER_PORT}`, CONTROL4_MODE: "mock", LOG_LEVEL: "INFO" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    c4.stdout?.on("data", (d) => process.stdout.write(`[c4] ${d}`));
    c4.stderr?.on("data", (d) => process.stderr.write(`[c4] ${d}`));
    subprocesses.push(c4);

    // Spawn Python iAquaLink adapter
    const iaqualink = spawn("python3", ["-u", "-m", "home_brain_iaqualink.main"], {
      cwd: path.join(ROOT, "adapters-py/iaqualink"),
      env: { ...process.env, MQTT_URL: `mqtt://localhost:${BROKER_PORT}`, IAQUALINK_MODE: "mock", LOG_LEVEL: "INFO" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    iaqualink.stdout?.on("data", (d) => process.stdout.write(`[iaq] ${d}`));
    iaqualink.stderr?.on("data", (d) => process.stderr.write(`[iaq] ${d}`));
    subprocesses.push(iaqualink);

    // Spawn Python Tuya adapter
    const tuya = spawn("python3", ["-u", "-m", "home_brain_tuya.main"], {
      cwd: path.join(ROOT, "adapters-py/tuya"),
      env: { ...process.env, MQTT_URL: `mqtt://localhost:${BROKER_PORT}`, TUYA_MODE: "mock", LOG_LEVEL: "INFO" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    tuya.stdout?.on("data", (d) => process.stdout.write(`[tuya] ${d}`));
    tuya.stderr?.on("data", (d) => process.stderr.write(`[tuya] ${d}`));
    subprocesses.push(tuya);

    // Control client for raw §A and §B
    client = mqtt.connect(`mqtt://localhost:${BROKER_PORT}`, { clientId: `smoke-${uuid().slice(0, 8)}` });
    await new Promise<void>((r) => client!.once("connect", () => r()));
    log("control client connected");

    const sonosHealth = awaiter<unknown>();
    const c4Health = awaiter<unknown>();
    const iaqHealth = awaiter<unknown>();
    const tuyaHealth = awaiter<unknown>();
    client.subscribe(["home/_meta/adapter/+/health"], { qos: 1 });
    client.on("message", (topic, payload) => {
      const msg = JSON.parse(payload.toString());
      if ((msg as { online?: boolean }).online === false) return;
      if (topic === "home/_meta/adapter/sonos/health") sonosHealth.resolve(msg);
      if (topic === "home/_meta/adapter/control4/health") c4Health.resolve(msg);
      if (topic === "home/_meta/adapter/iaqualink/health") iaqHealth.resolve(msg);
      if (topic === "home/_meta/adapter/tuya/health") tuyaHealth.resolve(msg);
    });

    log("waiting for all 4 adapter healths...");
    await Promise.race([
      Promise.all([sonosHealth.promise, c4Health.promise, iaqHealth.promise, tuyaHealth.promise]),
      sleep(20_000).then(() => Promise.reject(new Error("health timeout"))),
    ]);
    log("all adapters healthy");

    // ──────────────────────────────────────────────────────────────────
    // §A — Sonos wire
    // ──────────────────────────────────────────────────────────────────
    log("\n=== §A: Sonos wire ===");
    client.subscribe(["home/+/music/state"], { qos: 1 });
    {
      const id = uuid();
      client.publish(
        "home/living_room/music/command",
        JSON.stringify({ id, ts: new Date().toISOString(), actor: "owner", op: "play", args: { query: "jazz rock" } }),
        { qos: 1 },
      );
      const echo = await waitState(client, "home/living_room/music/state", id, 5_000);
      assert("Sonos play echoes _cmd_id", echo._cmd_id === id);
      assert("Sonos play sets playing=true", echo.state["playing"] === true);
      assert("Sonos play returns a track", typeof echo.state["track"] === "string");
    }
    {
      const id = uuid();
      client.publish(
        "home/living_room/music/command",
        JSON.stringify({ id, ts: new Date().toISOString(), actor: "owner", op: "pause", args: {} }),
        { qos: 1 },
      );
      const echo = await waitState(client, "home/living_room/music/state", id, 5_000);
      assert("Sonos pause echoes _cmd_id", echo._cmd_id === id);
      assert("Sonos pause sets playing=false", echo.state["playing"] === false);
    }

    // ──────────────────────────────────────────────────────────────────
    // §B — Control4 wire
    // ──────────────────────────────────────────────────────────────────
    log("\n=== §B: Control4 wire ===");
    client.subscribe(["home/+/lights/state", "home/+/c4/state", "home/_house/c4/state"], { qos: 1 });
    {
      const id = uuid();
      client.publish(
        "home/living_room/lights/command",
        JSON.stringify({ id, ts: new Date().toISOString(), actor: "owner", op: "set", args: { on: true, brightness: 70 } }),
        { qos: 1 },
      );
      const echo = await waitState(client, "home/living_room/lights/state", id, 5_000);
      assert("Lights set echoes _cmd_id", echo._cmd_id === id);
      assert("Lights on=true", echo.state["on"] === true);
      assert("Lights brightness=70", echo.state["brightness"] === 70);
    }
    {
      const id = uuid();
      client.publish(
        "home/_house/c4/command",
        JSON.stringify({ id, ts: new Date().toISOString(), actor: "owner", op: "scene", args: { name: "theater_movie", room: "theater" } }),
        { qos: 1 },
      );
      const echo = await waitState(client, "home/_house/c4/state", id, 5_000);
      assert("C4 scene echoes _cmd_id", echo._cmd_id === id);
      assert("C4 scene last_scene='theater_movie'", echo.state["last_scene"] === "theater_movie");
      assert("C4 scene last_room='theater'", echo.state["last_room"] === "theater");
    }

    // ──────────────────────────────────────────────────────────────────
    // §C — Scene engine running movie_night across both adapters
    // ──────────────────────────────────────────────────────────────────
    log("\n=== §C: Scene engine (run_scene movie_night) ===");
    bus = new Bus(`mqtt://localhost:${BROKER_PORT}`);
    await bus.connect();
    const house = loadHouse();
    const scenes = loadScenes(scenesPath);
    const registry = new ToolRegistry();
    registerTools(registry);
    const fakeWorld = {
      snapshot: async () => ({}),
      setDeviceState: async () => {},
      getDeviceState: async () => null,
    } as unknown as World;

    // Capture scheduled fires for §E
    const scheduledFires: { jobId: string; actions: string[] }[] = [];
    const scheduler = new MemoryScheduler(async (job) => {
      scheduledFires.push({ jobId: job.id, actions: job.actions.map((a) => a.tool) });
      for (const action of job.actions) {
        await registry.run(action, {
          bus: bus!,
          world: fakeWorld,
          house,
          scenes,
          scheduler,
          registry,
          actor: job.actor,
        });
      }
    });

    const result = await registry.run(
      { tool: "run_scene", args: { scene: "movie_night" } },
      { bus, world: fakeWorld, house, scenes, scheduler, registry, actor: "owner" },
    );

    assert("scene engine reports ok", result.ok);
    assert("scene message mentions the scene name", /Movie Night/.test(result.message));
    const stepResults = (result.state as { steps?: { tool: string; ok: boolean }[] } | undefined)?.steps ?? [];
    assert("scene ran 3 steps", stepResults.length === 3);
    assert(
      "all scene steps succeeded",
      stepResults.every((s) => s.ok),
    );
    assert(
      "scene includes a run_c4_scene step",
      stepResults.some((s) => s.tool === "run_c4_scene" && s.ok),
    );
    assert(
      "scene includes two set_music steps",
      stepResults.filter((s) => s.tool === "set_music").length === 2,
    );

    // ──────────────────────────────────────────────────────────────────
    // §D — Climate wire (iAquaLink hot_tub + Tuya sauna)
    // ──────────────────────────────────────────────────────────────────
    log("\n=== §D: Climate wire (iAquaLink + Tuya) ===");
    {
      const r = await registry.run(
        { tool: "set_climate", args: { zone: "hot_tub", target_f: 102 } },
        { bus, world: fakeWorld, house, scenes, scheduler, registry, actor: "owner" },
      );
      assert("hot_tub set_climate ok", r.ok);
      const s = r.state as Record<string, unknown> | undefined;
      assert("hot_tub target_f == 102", s?.["target_f"] === 102);
      assert("hot_tub mode == heat", s?.["mode"] === "heat");
      assert("hot_tub heating == true", s?.["heating"] === true);
    }
    {
      const r = await registry.run(
        { tool: "set_climate", args: { zone: "sauna", target_f: 180 } },
        { bus, world: fakeWorld, house, scenes, scheduler, registry, actor: "owner" },
      );
      assert("sauna set_climate ok", r.ok);
      const s = r.state as Record<string, unknown> | undefined;
      assert("sauna target_f == 180", s?.["target_f"] === 180);
      assert("sauna mode == heat", s?.["mode"] === "heat");
    }

    // ──────────────────────────────────────────────────────────────────
    // §E — schedule_action fires a future set_climate
    // ──────────────────────────────────────────────────────────────────
    log("\n=== §E: schedule_action ===");
    const fireAt = new Date(Date.now() + 1500).toISOString();
    const sched = await registry.run(
      {
        tool: "schedule_action",
        args: {
          when: fireAt,
          actions: [{ tool: "set_climate", args: { zone: "hot_tub", target_f: 104 } }],
          label: "warm hot tub for smoke test",
        },
      },
      { bus, world: fakeWorld, house, scenes, scheduler, registry, actor: "owner" },
    );
    assert("schedule_action ok", sched.ok);
    assert("schedule_action returns jobId", typeof (sched.state as Record<string, unknown> | undefined)?.["jobId"] === "string");

    log("waiting ~2s for the scheduled job to fire...");
    await sleep(2500);
    assert("scheduled job fired", scheduledFires.length === 1);
    assert("scheduled job ran set_climate", scheduledFires[0]?.actions.includes("set_climate") ?? false);

    // Verify the scheduled action actually reached the iAquaLink adapter by
    // querying the world model snapshot from the broker (retained state)
    const finalState = awaiter<{ state: Record<string, unknown> }>();
    client.subscribe("home/backyard/hot_tub/state", { qos: 1 });
    client.once("message", (topic, payload) => {
      if (topic === "home/backyard/hot_tub/state") {
        finalState.resolve(JSON.parse(payload.toString()));
      }
    });
    const f = await Promise.race([finalState.promise, sleep(2000).then(() => null)]);
    assert("scheduled set_climate updated hot_tub state", f !== null && (f.state as Record<string, unknown>)["target_f"] === 104);

    console.log("");
    if (failures.length === 0) {
      log("✓ all checks passed");
    } else {
      log(`✗ ${failures.length} failure(s):`);
      for (const f of failures) log("  -", f);
      exitCode = 1;
    }
  } catch (err) {
    console.error("[smoke] error:", err);
    exitCode = 1;
  } finally {
    if (bus) await bus.disconnect().catch(() => {});
    client?.end(true);
    for (const p of subprocesses) {
      if (p.pid) {
        p.kill("SIGTERM");
        await new Promise<void>((r) => {
          p.once("exit", () => r());
          setTimeout(() => {
            try {
              p.kill("SIGKILL");
            } catch {}
            r();
          }, 3000);
        });
      }
    }
    await new Promise<void>((r) => server.close(() => r()));
    broker.close();
    try {
      fs.unlinkSync(scenesPath);
    } catch {}
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
