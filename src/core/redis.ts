import IORedis from "ioredis";
import { config } from "../config.js";
import { log } from "./log.js";

/**
 * Shared lazy ioredis client for things that need raw Redis (rate limits,
 * voice request dedupe, etc.). World/Scheduler/BullMQ keep their own
 * dedicated connections.
 */
let _shared: IORedis | null = null;

export function sharedRedis(): IORedis {
  if (_shared) return _shared;
  _shared = new IORedis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
  _shared.on("error", (err) => log.warn({ err: err.message }, "shared redis error"));
  return _shared;
}

export async function closeSharedRedis(): Promise<void> {
  if (_shared) {
    _shared.disconnect();
    _shared = null;
  }
}
