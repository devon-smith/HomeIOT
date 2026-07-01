import { type House } from "../core/house.js";
import { type Scenes } from "../core/scenes.js";
import { type ToolCall } from "./types.js";

interface Pattern {
  name: string;
  regex: RegExp;
  build: (m: RegExpMatchArray, house: House, scenes: Scenes) => ToolCall | null;
}

/**
 * Resolve a room name written in chat to a room slug from house.yaml.
 * Accepts either "living_room" or "living room" (label-style).
 */
function resolveRoom(input: string | undefined, house: House): string | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase().replace(/\s+/g, "_");
  if (house.rooms[cleaned]) return cleaned;
  for (const [slug, def] of Object.entries(house.rooms)) {
    if (def.label.toLowerCase() === input.trim().toLowerCase()) return slug;
  }
  return null;
}

function normalizeSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

function stripLeadingRoom(input: string, house: House): string {
  const raw = input.trim();
  const normalized = normalizeSlug(raw);
  for (const [slug, def] of Object.entries(house.rooms)) {
    const labels = [slug, def.label.toLowerCase().replace(/\s+/g, "_")];
    for (const label of labels) {
      if (normalized.startsWith(`${label}_`)) {
        return normalized.slice(label.length + 1);
      }
    }
  }
  return normalized;
}

function resolveSkylightDevice(room: string, house: House): string | null {
  const devices = house.rooms[room]?.devices;
  if (!devices) return null;
  if (devices["skylight"]) return "skylight";
  if (devices["blinds"]) return "blinds";
  const match = Object.keys(devices).find((d) => /sky_?light|blind|shade/.test(d));
  return match ?? null;
}

function normalizeCoverAction(action: string): "open" | "close" {
  return action.toLowerCase() === "shut" ? "close" : (action.toLowerCase() as "open" | "close");
}

function buildSkylight(actionInput: string, roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room) return null;
  const device = resolveSkylightDevice(room, house);
  if (!device) return null;
  const action = normalizeCoverAction(actionInput);
  return { tool: "set_skylight", args: { room, device, action } };
}

function buildSkylightPosition(
  positionInput: string,
  roomInput: string | undefined,
  house: House,
): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room) return null;
  const device = resolveSkylightDevice(room, house);
  if (!device) return null;
  const position = Math.min(100, Math.max(0, parseInt(positionInput, 10)));
  return { tool: "set_skylight", args: { room, device, position } };
}

function buildLights(on: boolean, roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room || !house.rooms[room]?.devices["lights"]) return null;
  return { tool: "set_lights", args: { room, on } };
}

function buildLightBrightness(
  brightnessInput: string,
  roomInput: string | undefined,
  house: House,
): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room || !house.rooms[room]?.devices["lights"]) return null;
  const brightness = Math.min(100, Math.max(0, parseInt(brightnessInput, 10)));
  return { tool: "set_lights", args: { room, brightness } };
}

function resolveDeviceSlug(input: string | undefined, house: House): string | null {
  if (!input) return null;
  const candidates = [normalizeSlug(input), stripLeadingRoom(input, house)];
  for (const candidate of candidates) {
    const matches = Object.values(house.rooms).filter((room) => room.devices[candidate]);
    if (matches.length === 1) return candidate;
  }
  return null;
}

function findDeviceLocation(device: string, house: House): { room: string; device: string } | null {
  const matches: Array<{ room: string; device: string }> = [];
  for (const [roomSlug, room] of Object.entries(house.rooms)) {
    if (room.devices[device]) matches.push({ room: roomSlug, device });
  }
  return matches.length === 1 ? matches[0]! : null;
}

function resolveClimateZone(input: string | undefined, house: House, includeRoomMembership = true): string | null {
  if (!input) return null;
  const slug = normalizeSlug(input.replace(/\btemperature\b/gi, "").trim());
  const room = resolveRoom(input, house);
  const hvacZones = house.hvac_zones ?? {};

  if (hvacZones[slug]) return hvacZones[slug].thermostat_device;
  if (includeRoomMembership) {
    for (const [zoneSlug, zone] of Object.entries(hvacZones)) {
      if (zone.rooms.includes(slug) || (room && zone.rooms.includes(room))) {
        return zone.thermostat_device;
      }
      if (zoneSlug === slug) return zone.thermostat_device;
    }
  }

  return resolveDeviceSlug(input, house);
}

function isClimateDevice(slug: string, house: House): boolean {
  const climateSlugs = /^(hot_?tub|spa|pool|sauna|hvac|hvac_.+|.+_hvac)$/;
  if (climateSlugs.test(slug)) return true;
  for (const room of Object.values(house.rooms)) {
    const dev = room.devices[slug];
    if (!dev) continue;
    const kind = (dev.config as Record<string, unknown> | undefined)?.["kind"];
    if (kind === "climate") return true;
    if ((dev.config as Record<string, unknown> | undefined)?.["c4_thermostat_id"]) return true;
  }
  return false;
}

function buildClimateTarget(
  zoneInput: string | undefined,
  targetInput: string,
  house: House,
): ToolCall | null {
  const zone = resolveClimateZone(zoneInput, house);
  if (!zone || !isClimateDevice(zone, house)) return null;
  const target_f = Math.min(220, Math.max(40, parseInt(targetInput, 10)));
  return { tool: "set_climate", args: { zone, target_f } };
}

function buildClimateModeTarget(
  zoneInput: string | undefined,
  modeInput: string,
  targetInput: string | undefined,
  house: House,
): ToolCall | null {
  const zone = resolveClimateZone(zoneInput, house);
  if (!zone || !isClimateDevice(zone, house)) return null;
  const mode = modeInput.toLowerCase() as "heat" | "cool" | "off" | "auto";
  const args: Record<string, unknown> = { zone, mode };
  if (targetInput !== undefined) {
    args["target_f"] = Math.min(220, Math.max(40, parseInt(targetInput, 10)));
  }
  return { tool: "set_climate", args };
}

function buildClimateMode(zoneInput: string | undefined, mode: "heat" | "cool" | "off" | "auto", house: House): ToolCall | null {
  const zone = resolveClimateZone(zoneInput, house, false);
  if (!zone || !isClimateDevice(zone, house)) return null;
  return { tool: "set_climate", args: { zone, mode } };
}

function buildClimateQuery(zoneInput: string | undefined, house: House): ToolCall | null {
  const zone = resolveClimateZone(zoneInput, house);
  if (!zone || !isClimateDevice(zone, house)) return null;
  const loc = findDeviceLocation(zone, house);
  if (!loc) return null;
  return { tool: "query_state", args: { path: `${loc.room}.${loc.device}` } };
}

function buildWaterFeature(on: boolean, nameInput: string | undefined, house: House): ToolCall | null {
  const name = resolveDeviceSlug(nameInput, house);
  if (!name) return null;
  if (!/(fountain|water|pool_?jets?|misters?)/.test(name)) return null;
  return { tool: "set_water_feature", args: { name, on } };
}

function buildPlayMusic(
  queryInput: string | undefined,
  roomInput: string | undefined,
  volumeInput: string | undefined,
  house: House,
): ToolCall | null {
  if (!queryInput) return null;
  const room = resolveRoom(roomInput, house);
  if (!room || !house.rooms[room]?.devices["music"]) return null;
  const query = queryInput.trim();
  if (!query) return null;
  const args: Record<string, unknown> = { room, query };
  if (volumeInput !== undefined) {
    args["volume"] = Math.min(100, Math.max(0, parseInt(volumeInput, 10)));
  }
  return { tool: "set_music", args };
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
  "forty-five": 45,
  sixty: 60,
};

function parseRelativeAmount(input: string | undefined): number | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  const parsed = parseInt(cleaned, 10);
  if (!Number.isNaN(parsed)) return parsed;
  return NUMBER_WORDS[cleaned] ?? NUMBER_WORDS[cleaned.replace(/\s+/g, "")] ?? null;
}

function buildScheduledAction(
  actionInput: string | undefined,
  amountInput: string | undefined,
  unitInput: string | undefined,
  house: House,
): ToolCall | null {
  if (!actionInput || !unitInput) return null;
  const amount = parseRelativeAmount(amountInput);
  if (!amount || amount < 1) return null;
  const action = classify(actionInput, house);
  if (!action) return null;
  const unit = unitInput.toLowerCase();
  const args: Record<string, unknown> = {
    actions: [action.toolCall],
    label: `${actionInput.trim()} in ${amount} ${unit.startsWith("hour") || unit === "hr" || unit === "hrs" ? "hours" : "minutes"}`,
  };
  if (unit.startsWith("hour") || unit === "hr" || unit === "hrs") {
    args["in_hours"] = amount;
  } else {
    args["in_minutes"] = amount;
  }
  return { tool: "schedule_action", args };
}

function buildCancelSchedule(labelInput: string | undefined): ToolCall | null {
  const raw = (labelInput ?? "").trim();
  const label = raw
    .replace(/\bschedules?\b/gi, "")
    .replace(/\bthe\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    tool: "cancel_schedule",
    args: label ? { label_match: label } : {},
  };
}

function buildSkylightQuery(roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room) return null;
  const device = resolveSkylightDevice(room, house);
  if (!device) return null;
  return { tool: "query_state", args: { path: `${room}.${device}` } };
}

function buildLightsQuery(roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room || !house.rooms[room]?.devices["lights"]) return null;
  return { tool: "query_state", args: { path: `${room}.lights` } };
}

function buildMusicQuery(roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room || !house.rooms[room]?.devices["music"]) return null;
  return { tool: "query_state", args: { path: `${room}.music` } };
}

function normalizeSceneSlug(input: string): string {
  return normalizeSlug(input)
    .replace(/^the_/, "")
    .replace(/^scene_/, "")
    .replace(/^run_/, "");
}

function c4Scenes(house: House): Record<string, unknown> {
  const c4 = house.c4 as Record<string, unknown> | undefined;
  const scenes = c4?.["scenes"];
  return scenes && typeof scenes === "object" ? scenes as Record<string, unknown> : {};
}

function buildScene(
  sceneInput: string | undefined,
  roomInput: string | undefined,
  house: House,
  scenes: Scenes,
): ToolCall | null {
  if (!sceneInput) return null;
  const scene = normalizeSceneSlug(sceneInput);
  const room = resolveRoom(roomInput, house);
  if (scenes[scene]) {
    return { tool: "run_scene", args: room ? { scene, room } : { scene } };
  }
  const c4 = c4Scenes(house);
  if (Object.prototype.hasOwnProperty.call(c4, scene)) {
    return { tool: "run_c4_scene", args: room ? { name: scene, room } : { name: scene } };
  }
  return null;
}

function buildVideoPower(on: boolean, roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room) return null;
  const devices = house.rooms[room]?.devices ?? {};
  if (devices["av"]) {
    if (!on) return { tool: "control_av", args: { room, action: "off" } };
    const sources = (devices["av"].config as Record<string, unknown> | undefined)?.["sources"];
    if (sources && typeof sources === "object") {
      const sourceNames = Object.keys(sources as Record<string, unknown>).sort();
      const source = sourceNames.includes("apple_tv") ? "apple_tv" : sourceNames[0];
      if (source) return { tool: "control_av", args: { room, action: "watch", source } };
    }
  }
  if (devices["tv"]) return { tool: "set_video", args: { room, on } };
  return null;
}

function buildWatchSource(sourceInput: string | undefined, roomInput: string | undefined, house: House): ToolCall | null {
  const room = resolveRoom(roomInput, house);
  if (!room || !sourceInput) return null;
  const source = normalizeSlug(sourceInput);
  const devices = house.rooms[room]?.devices ?? {};
  if (devices["av"]) return { tool: "control_av", args: { room, action: "watch", source } };
  if (devices["tv"]) return { tool: "set_video", args: { room, on: true, input: source } };
  return null;
}

// Pattern order matters: more specific patterns first.
const patterns: Pattern[] = [
  {
    name: "query_skylight_room_first",
    regex: /^(?:(?:what\s+percentage\s+)?(?:open|closed)\s+(?:are|is)|how\s+(?:open|closed)\s+(?:are|is))\s+(?:the\s+)?(.+?)\s+(?:sky\s*lights?|skylights?|blinds?|shades?)$/i,
    build: (m, house) => buildSkylightQuery(m[1], house),
  },
  {
    name: "query_skylight_device_first",
    regex: /^(?:(?:what\s+percentage\s+)?(?:open|closed)\s+(?:are|is)|how\s+(?:open|closed)\s+(?:are|is))\s+(?:the\s+)?(?:sky\s*lights?|skylights?|blinds?|shades?)\s+in\s+(?:the\s+)?(.+)$/i,
    build: (m, house) => buildSkylightQuery(m[1], house),
  },
  {
    name: "query_lights_state",
    regex: /^(?:are|is)\s+(?:the\s+)?(.+?)\s+lights?\s+(?:on|off)$/i,
    build: (m, house) => buildLightsQuery(m[1], house),
  },
  {
    name: "query_music_playing",
    regex: /^(?:is\s+anything|what(?:'s| is))\s+playing\s+in\s+(?:the\s+)?(.+)$/i,
    build: (m, house) => buildMusicQuery(m[1], house),
  },
  {
    name: "query_climate_temperature",
    regex: /^(?:what(?:'s| is)\s+)?(?:the\s+)?temperature\s+(?:in\s+)?(?:the\s+)?(.+)$/i,
    build: (m, house) => buildClimateQuery(m[1], house),
  },
  {
    name: "query_climate_temperature_prefix",
    regex: /^(?:what(?:'s| is)\s+)?(?:the\s+)?(.+?)\s+temperature$/i,
    build: (m, house) => buildClimateQuery(m[1], house),
  },
  {
    name: "run_known_scene",
    regex: /^(?:please\s+)?(?:(?:run|start|activate|set\s+up|do)\s+)?(?:the\s+)?(.+?)(?:\s+in\s+(?:the\s+)?(.+))?$/i,
    build: (m, house, scenes) => buildScene(m[1], m[2], house, scenes),
  },
  {
    name: "schedule_relative_action",
    regex: /^(?:please\s+)?(.+?)\s+in\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty(?:-|\s*)five|forty|sixty)\s+(minutes?|mins?|hours?|hrs?)$/i,
    build: (m, house) => buildScheduledAction(m[1], m[2], m[3], house),
  },
  {
    name: "cancel_schedule",
    regex: /^(?:please\s+)?(?:cancel|clear|delete)\s+(?:(?:the\s+)?(.+?)\s+)?schedules?$/i,
    build: (m) => buildCancelSchedule(m[1]),
  },
  {
    name: "lights_action_room_first",
    regex: /^(?:please\s+)?(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+?)\s+lights?$/i,
    build: (m, house) => buildLights(m[1]!.toLowerCase() === "on", m[2], house),
  },
  {
    name: "lights_action_device_first",
    regex: /^(?:please\s+)?(?:turn|switch)\s+(?:the\s+)?lights?\s+in\s+(?:the\s+)?(.+?)\s+(on|off)$/i,
    build: (m, house) => buildLights(m[2]!.toLowerCase() === "on", m[1], house),
  },
  {
    name: "lights_action_state_last",
    regex: /^(?:please\s+)?(?:turn|switch)\s+(?:the\s+)?(.+?)\s+lights?\s+(on|off)$/i,
    build: (m, house) => buildLights(m[2]!.toLowerCase() === "on", m[1], house),
  },
  {
    name: "lights_brightness_room_first",
    regex: /^(?:please\s+)?(?:(?:set|dim|brighten)\s+)?(?:the\s+)?(.+?)\s+lights?\s+to\s+(\d{1,3})(?:\s*%)?$/i,
    build: (m, house) => buildLightBrightness(m[2]!, m[1], house),
  },
  {
    name: "lights_brightness_room_only",
    regex: /^(?:please\s+)?(?:dim|brighten|set)\s+(?:the\s+)?(.+?)\s+to\s+(\d{1,3})(?:\s*%)?$/i,
    build: (m, house) => buildLightBrightness(m[2]!, m[1], house),
  },
  {
    name: "lights_brightness_device_first",
    regex: /^(?:please\s+)?(?:(?:set|dim|brighten)\s+)?(?:the\s+)?lights?\s+in\s+(?:the\s+)?(.+?)\s+to\s+(\d{1,3})(?:\s*%)?$/i,
    build: (m, house) => buildLightBrightness(m[2]!, m[1], house),
  },
  {
    name: "skylight_action_room_first",
    regex: /^(?:please\s+)?(open|close|shut)\s+(?:the\s+)?(.+?)\s+(?:sky\s*light\s+windows?|skylight\s+windows?|sky\s*lights?|skylights?|blinds?|shades?)$/i,
    build: (m, house) => buildSkylight(m[1]!, m[2], house),
  },
  {
    name: "skylight_action_device_first",
    regex: /^(?:please\s+)?(open|close|shut)\s+(?:the\s+)?(?:sky\s*light\s+windows?|skylight\s+windows?|sky\s*lights?|skylights?|blinds?|shades?)\s+in\s+(?:the\s+)?(.+)$/i,
    build: (m, house) => buildSkylight(m[1]!, m[2], house),
  },
  {
    name: "skylight_position_room_first",
    regex: /^(?:please\s+)?(?:set\s+)?(?:the\s+)?(.+?)\s+(?:sky\s*light\s+windows?|skylight\s+windows?|sky\s*lights?|skylights?|blinds?|shades?)\s+to\s+(\d{1,3})(?:\s*%)?$/i,
    build: (m, house) => buildSkylightPosition(m[2]!, m[1], house),
  },
  {
    name: "skylight_position_device_first",
    regex: /^(?:please\s+)?(?:set\s+)?(?:the\s+)?(?:sky\s*light\s+windows?|skylight\s+windows?|sky\s*lights?|skylights?|blinds?|shades?)\s+in\s+(?:the\s+)?(.+?)\s+to\s+(\d{1,3})(?:\s*%)?$/i,
    build: (m, house) => buildSkylightPosition(m[2]!, m[1], house),
  },
  {
    name: "climate_target",
    regex: /^(?:please\s+)?(?:warm|heat|set)\s+(?:the\s+)?(.+?)\s+(?:to|at)\s+(\d{2,3})(?:\s*(?:degrees?|°|f))?$/i,
    build: (m, house) => buildClimateTarget(m[1], m[2]!, house),
  },
  {
    name: "climate_mode_target",
    regex: /^(?:please\s+)?(?:set)\s+(?:the\s+)?(.+?)\s+to\s+(heat|cool|auto)\s*(\d{2,3})?(?:\s*(?:degrees?|°|f))?$/i,
    build: (m, house) => buildClimateModeTarget(m[1], m[2]!, m[3], house),
  },
  {
    name: "climate_off",
    regex: /^(?:please\s+)?(?:turn|switch)\s+off\s+(?:the\s+)?(.+)$/i,
    build: (m, house) => buildClimateMode(m[1], "off", house),
  },
  {
    name: "climate_heat",
    regex: /^(?:please\s+)?(?:turn|switch)\s+on\s+(?:the\s+)?(.+?)\s+(?:heat|heater)$/i,
    build: (m, house) => buildClimateMode(m[1], "heat", house),
  },
  {
    name: "water_feature_action",
    regex: /^(?:please\s+)?(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+)$/i,
    build: (m, house) => buildWaterFeature(m[1]!.toLowerCase() === "on", m[2], house),
  },
  {
    name: "video_power_action",
    regex: /^(?:please\s+)?(?:turn|switch)\s+(on|off)\s+(?:the\s+)?(.+?)(?:\s+tv)?$/i,
    build: (m, house) => buildVideoPower(m[1]!.toLowerCase() === "on", m[2], house),
  },
  {
    name: "video_power_state_last",
    regex: /^(?:please\s+)?(?:turn|switch)\s+(?:the\s+)?(.+?)(?:\s+tv)?\s+(on|off)$/i,
    build: (m, house) => buildVideoPower(m[2]!.toLowerCase() === "on", m[1], house),
  },
  {
    name: "watch_source",
    regex: /^(?:please\s+)?(?:watch|play|start)\s+(.+?)\s+(?:in|on)\s+(?:the\s+)?(.+?)(?:\s+tv)?$/i,
    build: (m, house) => buildWatchSource(m[1], m[2], house),
  },
  {
    name: "play_music_query",
    regex: /^(?:please\s+)?(?:play|start)\s+(.+?)\s+(?:in|on)\s+(?:the\s+)?(.+?)(?:\s+at\s+(?:volume\s+)?(\d{1,3})(?:\s*%)?)?$/i,
    build: (m, house) => buildPlayMusic(m[1], m[2], m[3], house),
  },
  {
    name: "pause_music",
    regex: /^(?:please\s+)?(?:pause|stop)(?:\s+(?:the\s+)?music)?(?:\s+in\s+(?:the\s+)?(.+))?$/i,
    build: (m, house) => {
      const room = resolveRoom(m[1], house);
      if (!room) return null;
      return { tool: "set_music", args: { room, action: "pause" } };
    },
  },
  {
    name: "resume_music",
    regex: /^(?:please\s+)?(?:resume|continue)(?:\s+(?:the\s+)?music)?(?:\s+in\s+(?:the\s+)?(.+))?$/i,
    build: (m, house) => {
      const room = resolveRoom(m[1], house);
      if (!room) return null;
      return { tool: "set_music", args: { room, action: "resume" } };
    },
  },
  {
    name: "next_track",
    regex: /^(?:next|skip)(?:\s+(?:song|track))?(?:\s+in\s+(?:the\s+)?(.+))?$/i,
    build: (m, house) => {
      const room = resolveRoom(m[1], house);
      if (!room) return null;
      return { tool: "set_music", args: { room, action: "next" } };
    },
  },
  {
    name: "previous_track",
    regex: /^(?:previous|prev|back)(?:\s+(?:song|track))?(?:\s+in\s+(?:the\s+)?(.+))?$/i,
    build: (m, house) => {
      const room = resolveRoom(m[1], house);
      if (!room) return null;
      return { tool: "set_music", args: { room, action: "previous" } };
    },
  },
  {
    name: "set_volume",
    regex: /^(?:set\s+)?(?:the\s+)?volume(?:\s+to)?\s+(\d{1,3})(?:\s*%)?(?:\s+in\s+(?:the\s+)?(.+))?$/i,
    build: (m, house) => {
      const value = Math.min(100, Math.max(0, parseInt(m[1]!, 10)));
      const room = resolveRoom(m[2], house);
      if (!room) return null;
      return { tool: "set_music", args: { room, volume: value } };
    },
  },
];

export interface ClassifyResult {
  toolCall: ToolCall;
  patternName: string;
}

export function classify(normalized: string, house: House, scenes: Scenes = {}): ClassifyResult | null {
  for (const p of patterns) {
    const m = normalized.match(p.regex);
    if (!m) continue;
    const toolCall = p.build(m, house, scenes);
    if (toolCall) return { toolCall, patternName: p.name };
  }
  return null;
}
