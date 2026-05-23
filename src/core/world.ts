import Redis from "ioredis";
import { config } from "../config.js";
import { log } from "./log.js";
import type { StateMessage } from "./bus.js";

const KEY_PREFIX = "world:";
const ROOM_INDEX = "world:_index";

/**
 * Redis-backed live world model.
 *
 * Layout:
 *   world:{room}:{device}    JSON-encoded StateMessage (current value)
 *   world:_index             SET of "{room}:{device}" tuples for enumeration
 *
 * Truth comes from MQTT retained-state topics; Redis is just a fast cache that
 * the LLM context assembler can read in a single MGET.
 */
export class World {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true });
    this.redis.on("error", (err) => log.error({ err }, "redis error"));
  }

  async connect(): Promise<void> {
    await this.redis.connect();
    log.info({ url: config.REDIS_URL }, "redis connected");
  }

  async setDeviceState(room: string, device: string, state: StateMessage): Promise<void> {
    const key = `${KEY_PREFIX}${room}:${device}`;
    const pipe = this.redis.pipeline();
    pipe.set(key, JSON.stringify(state));
    pipe.sadd(ROOM_INDEX, `${room}:${device}`);
    await pipe.exec();
  }

  async getDeviceState(room: string, device: string): Promise<StateMessage | null> {
    const raw = await this.redis.get(`${KEY_PREFIX}${room}:${device}`);
    return raw ? (JSON.parse(raw) as StateMessage) : null;
  }

  async snapshot(): Promise<Record<string, Record<string, StateMessage>>> {
    const tuples = await this.redis.smembers(ROOM_INDEX);
    if (tuples.length === 0) return {};
    const keys = tuples.map((t) => `${KEY_PREFIX}${t}`);
    const values = await this.redis.mget(keys);
    const out: Record<string, Record<string, StateMessage>> = {};
    tuples.forEach((tuple, i) => {
      const [room, device] = tuple.split(":");
      if (!room || !device) return;
      const raw = values[i];
      if (!raw) return;
      out[room] ??= {};
      out[room][device] = JSON.parse(raw) as StateMessage;
    });
    return out;
  }

  async clear(): Promise<void> {
    const tuples = await this.redis.smembers(ROOM_INDEX);
    if (tuples.length > 0) {
      const keys = tuples.map((t) => `${KEY_PREFIX}${t}`);
      await this.redis.del(...keys, ROOM_INDEX);
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
