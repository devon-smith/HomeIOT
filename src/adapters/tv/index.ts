import mqtt, { type MqttClient } from "mqtt";
import { v4 as uuid } from "uuid";
import { config } from "../../config.js";
import { log } from "../../core/log.js";
import { loadHouse, iterDevices } from "../../core/house.js";
import { type Brand, type TVBackend, type TVConfig, type TVState } from "./backend.js";
import { MockTVBackend } from "./mock-backend.js";
import {
  SamsungTVBackend,
  LGTVBackend,
  SonyTVBackend,
  AppleTVBackend,
} from "./brand-backends.js";

const NAME = "tv";
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

const REAL_BACKEND_BY_BRAND: Record<Brand, () => TVBackend> = {
  samsung: () => new SamsungTVBackend(),
  lg: () => new LGTVBackend(),
  sony: () => new SonyTVBackend(),
  apple_tv: () => new AppleTVBackend(),
  mock: () => new MockTVBackend(),
};

async function main() {
  const mode = (process.env["TV_MODE"] ?? "mock").toLowerCase();
  log.info({ mode }, "tv adapter starting");

  const house = loadHouse();
  const tvs: TVConfig[] = [];
  for (const { room, device, adapter, config: dconf } of iterDevices(house)) {
    if (device !== "tv" || adapter !== "tv") continue;
    const brand = ((dconf["brand"] as string) ?? "mock") as Brand;
    tvs.push({
      room,
      brand,
      ip: dconf["ip"] as string | undefined,
      config: dconf,
    });
  }
  if (tvs.length === 0) {
    log.error("no rooms in house.yaml use the tv adapter for tv; nothing to do");
    process.exit(1);
  }
  log.info({ tvs: tvs.map((t) => ({ room: t.room, brand: t.brand })) }, "tvs to manage");

  // One backend per brand. In mock mode, every brand uses MockTVBackend.
  const backends = new Map<Brand, TVBackend>();
  const brandsUsed = new Set(tvs.map((t) => t.brand));
  for (const brand of brandsUsed) {
    const backend = mode === "mock" ? new MockTVBackend() : REAL_BACKEND_BY_BRAND[brand]();
    const brandTvs = tvs.filter((t) => t.brand === brand);
    await backend.init(brandTvs);
    backends.set(brand, backend);
  }
  const brandForRoom = new Map<string, Brand>(tvs.map((t) => [t.room, t.brand]));

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
    const topics = tvs.map((t) => `home/${t.room}/tv/command`);
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        log.error({ err }, "subscribe failed");
        return;
      }
      log.info({ topics }, "subscribed");
      publishHealth(client, startedAt, tvs.length, lastError);
      for (const t of tvs) {
        const backend = backends.get(t.brand)!;
        backend.getState(t.room).then(
          (s) => publishState(client, t.room, s, null),
          (err) => log.error({ err, room: t.room }, "initial state fetch failed"),
        );
      }
    });
  });

  setInterval(() => publishHealth(client, startedAt, tvs.length, lastError), HEARTBEAT_MS);

  // External-change handlers per backend
  for (const [brand, backend] of backends) {
    backend.onExternalChange((room, state) => {
      log.debug({ brand, room, state }, "external state change");
      publishState(client, room, state, null);
    });
  }

  client.on("message", async (topic, payload) => {
    const parts = topic.split("/");
    if (parts.length !== 4 || parts[0] !== "home" || parts[3] !== "command") return;
    const room = parts[1]!;
    if (parts[2] !== "tv") return;

    let cmd: CommandMessage;
    try {
      cmd = JSON.parse(payload.toString()) as CommandMessage;
    } catch (err) {
      log.error({ err, topic }, "bad command payload");
      return;
    }
    const brand = brandForRoom.get(room);
    if (!brand) {
      log.warn({ room }, "received command for unknown TV");
      return;
    }
    const backend = backends.get(brand)!;
    log.info({ room, op: cmd.op, id: cmd.id, brand }, "command received");

    try {
      let state: TVState;
      switch (cmd.op) {
        case "set": {
          let cur = await backend.getState(room);
          if (typeof cmd.args["on"] === "boolean") cur = await backend.setOn(room, cmd.args["on"] as boolean);
          if (typeof cmd.args["input"] === "string") cur = await backend.setInput(room, cmd.args["input"] as string);
          if (typeof cmd.args["volume"] === "number") cur = await backend.setVolume(room, cmd.args["volume"] as number);
          if (typeof cmd.args["muted"] === "boolean") cur = await backend.setMuted(room, cmd.args["muted"] as boolean);
          state = cur;
          break;
        }
        default:
          throw new Error(`unsupported op: ${cmd.op}`);
      }
      lastError = null;
      publishState(client, room, state, cmd.id);
    } catch (err) {
      const msg = (err as Error).message;
      lastError = msg;
      log.error({ err, room, op: cmd.op }, "command failed");
      const current = await backend.getState(room).catch(() => null);
      const failureState: TVState = current ?? { on: false, online: false };
      publishState(client, room, failureState, cmd.id, msg);
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
    for (const backend of backends.values()) await backend.close().catch(() => {});
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
  state: TVState,
  cmdId: string | null,
  lastError?: string,
): void {
  const { online, ...rest } = state;
  const msg: StateMessage = {
    ts: new Date().toISOString(),
    source: NAME,
    online,
    _cmd_id: cmdId,
    pending: false,
    state: {
      ...rest,
      ...(lastError ? { last_error: lastError } : {}),
    },
  };
  client.publish(`home/${room}/tv/state`, JSON.stringify(msg), { qos: 1, retain: true });
}

main().catch((err) => {
  log.fatal({ err }, "tv adapter fatal error");
  process.exit(1);
});
