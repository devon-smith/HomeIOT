import { type House } from "../core/house.js";
import { type ToolCall } from "./types.js";

interface Pattern {
  name: string;
  regex: RegExp;
  build: (m: RegExpMatchArray, house: House) => ToolCall | null;
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

// Pattern order matters: more specific patterns first.
const patterns: Pattern[] = [
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

export function classify(normalized: string, house: House): ClassifyResult | null {
  for (const p of patterns) {
    const m = normalized.match(p.regex);
    if (!m) continue;
    const toolCall = p.build(m, house);
    if (toolCall) return { toolCall, patternName: p.name };
  }
  return null;
}
