import mqtt, { type MqttClient } from "mqtt";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { log } from "../../core/log.js";
import { loadHouse, iterDevices } from "../../core/house.js";
import { type SonosBackend, type ZoneConfig, type ZoneState } from "./backend.js";
import { MockSonosBackend } from "./mock-backend.js";
import { RealSonosBackend } from "./sonos-backend.js";

const NAME = "sonos";
const VERSION = "0.1.0";
const HEARTBEAT_MS = 15_000;

interface CommandMessage {
  id: string;
  ts: string;
  actor: string;
  op: string;
  args: Record<string, unknown>;
}

interface StateMessage {
  ts: string;
  source: string;
  online: boolean;
  _cmd_id: string | null;
  pending: boolean;
  state: Record<string, unknown>;
}

async function main() {
  const mode = (process.env["SONOS_MODE"] ?? "mock").toLowerCase();
  log.info({ mode }, "sonos adapter starting");

  const house = loadHouse();
  const zones: ZoneConfig[] = [];
  for (const { room, device, adapter, config: dconf } of iterDevices(house)) {
    if (device === "music" && adapter === "sonos") {
      const zoneName = (dconf["sonos_zone"] as string) ?? room;
      zones.push({ room, zoneName });
    }
  }
  if (zones.length === 0) {
    log.error("no rooms in house.yaml use the sonos adapter for music; nothing to do");
    process.exit(1);
  }
  log.info({ zones: zones.map((z) => z.room) }, "zones to manage");

  const backend: SonosBackend = mode === "mock" ? new MockSonosBackend() : new RealSonosBackend();
  await backend.init(zones);

  const client = mqtt.connect(config.MQTT_URL, {
    clientId: `${NAME}-${uuid().slice(0, 8)}`,
    clean: true,
    reconnectPeriod: 2000,
    will: {
      topic: `home/_meta/adapter/${NAME}/health`,
      payload: JSON.stringify({ name: NAME, online: false, ts: new Date().toISOString() }),
      qos: 1,
      retain: true,
    },
  });

  const startedAt = Date.now();
  let lastError: string | null = null;

  client.on("connect", () => {
    log.info({ url: config.MQTT_URL }, "mqtt connected");
    const topics = zones.map((z) => `home/${z.room}/music/command`);
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        log.error({ err }, "subscribe failed");
        return;
      }
      log.info({ topics }, "subscribed");
      publishHealth(client, startedAt, zones.length, lastError);
      // Publish initial state for each zone so the orchestrator's world model hydrates immediately.
      for (const z of zones) {
        backend.getState(z.room).then(
          (s) => publishState(client, z.room, s, null, false),
          (err) => log.error({ err, room: z.room }, "initial state fetch failed"),
        );
      }
    });
  });

  setInterval(() => publishHealth(client, startedAt, zones.length, lastError), HEARTBEAT_MS);

  backend.onExternalChange((room, state) => {
    log.debug({ room, state }, "external state change");
    publishState(client, room, state, null, false);
  });

  client.on("message", async (topic, payload) => {
    const parts = topic.split("/");
    if (parts.length !== 4 || parts[0] !== "home" || parts[3] !== "command") return;
    const room = parts[1]!;
    if (parts[2] !== "music") return;

    let cmd: CommandMessage;
    try {
      cmd = JSON.parse(payload.toString()) as CommandMessage;
    } catch (err) {
      log.error({ err, topic }, "bad command payload");
      return;
    }
    log.info({ room, op: cmd.op, id: cmd.id }, "command received");

    try {
      let state: ZoneState;
      switch (cmd.op) {
        case "play":
          state = await backend.play(room, cmd.args["query"] as string | undefined, cmd.args["uri"] as string | undefined);
          break;
        case "pause":
          state = await backend.pause(room);
          break;
        case "resume":
          state = await backend.resume(room);
          break;
        case "next":
          state = await backend.next(room);
          break;
        case "previous":
          state = await backend.previous(room);
          break;
        case "set_volume":
          state = await backend.setVolume(room, cmd.args["value"] as number);
          break;
        default:
          throw new Error(`unsupported op: ${cmd.op}`);
      }
      // If a volume was bundled alongside another op, apply it.
      if (cmd.op !== "set_volume" && typeof cmd.args["volume"] === "number") {
        state = await backend.setVolume(room, cmd.args["volume"] as number);
      }
      lastError = null;
      publishState(client, room, state, cmd.id, false);
    } catch (err) {
      const msg = (err as Error).message;
      lastError = msg;
      log.error({ err, room, op: cmd.op }, "command failed");
      const current = await backend.getState(room).catch(() => null);
      const failureState: ZoneState = current ?? { playing: false, online: false };
      publishState(client, room, failureState, cmd.id, false, msg);
    }
  });

  client.on("error", (err) => log.error({ err }, "mqtt error"));

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    try {
      client.publish(
        `home/_meta/adapter/${NAME}/health`,
        JSON.stringify({ name: NAME, online: false, ts: new Date().toISOString() }),
        { qos: 1, retain: true },
      );
    } catch {}
    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    await backend.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function publishHealth(client: MqttClient, startedAt: number, devicesTotal: number, lastError: string | null): void {
  client.publish(
    `home/_meta/adapter/${NAME}/health`,
    JSON.stringify({
      ts: new Date().toISOString(),
      name: NAME,
      version: VERSION,
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      devices_online: devicesTotal,
      devices_total: devicesTotal,
      last_error: lastError,
    }),
    { qos: 1, retain: true },
  );
}

function publishState(
  client: MqttClient,
  room: string,
  state: ZoneState,
  cmdId: string | null,
  pending: boolean,
  lastError?: string,
): void {
  const msg: StateMessage = {
    ts: new Date().toISOString(),
    source: NAME,
    online: state.online,
    _cmd_id: cmdId,
    pending,
    state: {
      ...state,
      ...(lastError ? { last_error: lastError } : {}),
    },
  };
  delete (msg.state as Record<string, unknown>)["online"];
  client.publish(`home/${room}/music/state`, JSON.stringify(msg), { qos: 1, retain: true });
}

main().catch((err) => {
  log.fatal({ err }, "sonos adapter fatal error");
  process.exit(1);
});
