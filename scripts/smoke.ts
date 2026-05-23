/**
 * End-to-end smoke test of the Sonos adapter — no Docker, no Sonos hardware,
 * no Anthropic key. Spins up an in-process MQTT broker via aedes, starts the
 * adapter as a child process with SONOS_MODE=mock, and verifies the
 * command → state echo round-trip.
 *
 * What this proves:
 *   - adapter loads config/house.example.yaml and picks up its rooms
 *   - adapter connects to MQTT and subscribes
 *   - adapter publishes hydrated state for each zone on startup (retained)
 *   - adapter responds to commands and echoes _cmd_id in the state update
 *   - adapter publishes a heartbeat under home/_meta/adapter/sonos/health
 *
 * Does not exercise: Claude planner, Postgres, Redis. Those need real
 * services and the API key — run locally with `docker compose up` and
 * `pnpm dev` to verify.
 */

import { Aedes } from "aedes";
import { createServer, type Server, type Socket } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import mqtt, { type MqttClient } from "mqtt";
import { v4 as uuid } from "uuid";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function main() {
  const failures: string[] = [];
  const log = (...args: unknown[]) => console.log("[smoke]", ...args);

  // 1. In-process broker
  const broker = await Aedes.createBroker();
  const server: Server = createServer((sock: Socket) => broker.handle(sock));
  await new Promise<void>((r) => server.listen(BROKER_PORT, r));
  log("broker listening on", BROKER_PORT);

  let adapter: ChildProcess | null = null;
  let client: MqttClient | null = null;
  let exitCode = 0;

  try {
    // 2. Spawn the adapter
    adapter = spawn("pnpm", ["sonos"], {
      cwd: ROOT,
      env: {
        ...process.env,
        MQTT_URL: `mqtt://localhost:${BROKER_PORT}`,
        SONOS_MODE: "mock",
        LOG_LEVEL: "info",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    adapter.stdout?.on("data", (d) => process.stdout.write(`[adapter] ${d}`));
    adapter.stderr?.on("data", (d) => process.stderr.write(`[adapter] ${d}`));

    // 3. Connect a control client
    client = mqtt.connect(`mqtt://localhost:${BROKER_PORT}`, { clientId: `smoke-${uuid().slice(0, 8)}` });
    await new Promise<void>((r) => client!.once("connect", () => r()));
    log("control client connected");

    // 4. Wait for adapter to subscribe and publish health + initial state
    const health = awaiter<unknown>();
    const initialLivingState = awaiter<{ _cmd_id: string | null; state: Record<string, unknown> }>();

    client.subscribe(["home/_meta/adapter/sonos/health", "home/+/music/state"], { qos: 1 });
    client.on("message", (topic, payload) => {
      const msg = JSON.parse(payload.toString());
      if (topic === "home/_meta/adapter/sonos/health") {
        health.resolve(msg);
      } else if (topic === "home/living_room/music/state") {
        initialLivingState.resolve(msg);
      }
    });

    log("waiting for adapter health...");
    await Promise.race([health.promise, sleep(15_000).then(() => Promise.reject(new Error("adapter health timeout")))]);
    log("got health:", health.promise);

    log("waiting for initial state...");
    await Promise.race([initialLivingState.promise, sleep(5_000).then(() => Promise.reject(new Error("initial state timeout")))]);
    const initial = await initialLivingState.promise;
    assert(failures, "initial state has no _cmd_id (not triggered by us)", initial._cmd_id === null);
    assert(failures, "initial state.playing is false", initial.state["playing"] === false);

    // 5. Send a play command and wait for the state echo with matching _cmd_id
    const cmdId = uuid();
    const stateEcho = awaiter<{ _cmd_id: string | null; state: Record<string, unknown> }>();
    client.removeAllListeners("message");
    client.on("message", (topic, payload) => {
      if (topic !== "home/living_room/music/state") return;
      const msg = JSON.parse(payload.toString());
      if (msg._cmd_id === cmdId) stateEcho.resolve(msg);
    });

    client.publish(
      "home/living_room/music/command",
      JSON.stringify({
        id: cmdId,
        ts: new Date().toISOString(),
        actor: "owner",
        op: "play",
        args: { query: "jazz rock" },
      }),
      { qos: 1, retain: false },
    );
    log("published play command, id:", cmdId);

    await Promise.race([stateEcho.promise, sleep(5_000).then(() => Promise.reject(new Error("state echo timeout")))]);
    const echo = await stateEcho.promise;
    log("got state echo:", echo);
    assert(failures, "echo _cmd_id matches", echo._cmd_id === cmdId);
    assert(failures, "echo state.playing is true", echo.state["playing"] === true);
    assert(failures, "echo state.track is set", typeof echo.state["track"] === "string");
    assert(failures, "echo state.source is 'search'", echo.state["source"] === "search");

    // 6. Send a pause command
    const pauseId = uuid();
    const pauseEcho = awaiter<{ _cmd_id: string | null; state: Record<string, unknown> }>();
    client.removeAllListeners("message");
    client.on("message", (topic, payload) => {
      if (topic !== "home/living_room/music/state") return;
      const msg = JSON.parse(payload.toString());
      if (msg._cmd_id === pauseId) pauseEcho.resolve(msg);
    });

    client.publish(
      "home/living_room/music/command",
      JSON.stringify({ id: pauseId, ts: new Date().toISOString(), actor: "owner", op: "pause", args: {} }),
      { qos: 1, retain: false },
    );
    log("published pause command, id:", pauseId);

    await Promise.race([pauseEcho.promise, sleep(5_000).then(() => Promise.reject(new Error("pause echo timeout")))]);
    const paused = await pauseEcho.promise;
    assert(failures, "pause echo _cmd_id matches", paused._cmd_id === pauseId);
    assert(failures, "pause echo state.playing is false", paused.state["playing"] === false);

    log("");
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
    client?.end(true);
    if (adapter && adapter.pid) {
      adapter.kill("SIGTERM");
      await new Promise<void>((r) => {
        adapter!.once("exit", () => r());
        setTimeout(() => r(), 2000);
      });
    }
    await new Promise<void>((r) => server.close(() => r()));
    broker.close();
  }

  process.exit(exitCode);
}

function assert(failures: string[], label: string, cond: boolean): void {
  if (cond) {
    console.log(`[smoke]  ✓ ${label}`);
  } else {
    console.log(`[smoke]  ✗ ${label}`);
    failures.push(label);
  }
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
