import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { log } from "./log.js";

const DeviceSchema = z.object({
  adapter: z.string(),
  config: z.record(z.unknown()).optional().default({}),
});

const RoomSchema = z.object({
  label: z.string(),
  devices: z.record(DeviceSchema),
});

const ActorSchema = z.object({
  role: z.enum(["owner", "partner", "guest"]),
  imessage_handles: z.array(z.string()).default([]),
});

const HvacZoneSchema = z.object({
  thermostat_device: z.string(),
  rooms: z.array(z.string()).default([]),
});

const PreferencesSchema = z.object({
  music: z
    .object({
      default_volume_by_room: z.record(z.number().int().min(0).max(100)).default({}),
      favorite_playlists: z.array(z.string()).default([]),
      mood_playlists: z.record(z.string()).default({}),
    })
    .default({}),
  lights: z
    .object({
      default_brightness: z.number().int().min(0).max(100).default(80),
    })
    .default({}),
  quick_actions: z
    .array(
      z.object({
        label: z.string(),
        message: z.string(),
        icon: z.string().optional(),
      }),
    )
    .default([]),
});

const HouseSchema = z.object({
  timezone: z.string().default("America/Los_Angeles"),
  rooms: z.record(RoomSchema),
  zones: z.record(z.array(z.string())).default({}),
  actors: z.record(ActorSchema).default({}),
  hvac_zones: z.record(HvacZoneSchema).optional(),
  preferences: PreferencesSchema.optional(),
  // c4: passthrough so we don't reject scene-id config; not used by brain directly.
  c4: z.record(z.unknown()).optional(),
});

export type House = z.infer<typeof HouseSchema>;

export function loadHouse(filePath?: string): House {
  const resolved = filePath
    ?? (fs.existsSync(path.resolve("config/house.yaml"))
      ? path.resolve("config/house.yaml")
      : path.resolve("config/house.example.yaml"));

  log.info({ path: resolved }, "loading house definition");
  const raw = fs.readFileSync(resolved, "utf8");
  const data = yaml.load(raw);
  return HouseSchema.parse(data);
}

export function* iterDevices(house: House): Generator<{ room: string; device: string; adapter: string; config: Record<string, unknown> }> {
  for (const [room, def] of Object.entries(house.rooms)) {
    for (const [device, ddef] of Object.entries(def.devices)) {
      yield { room, device, adapter: ddef.adapter, config: ddef.config ?? {} };
    }
  }
}
