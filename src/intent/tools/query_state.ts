import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z.object({
  path: z.string().optional().describe("Dotted path like 'living_room.music' or omit for full snapshot"),
});

type Args = z.infer<typeof schema>;

export const queryState: ToolDef<Args> = {
  name: "query_state",
  description:
    "Read the current world model. Pass a dotted path like 'living_room.music' to scope; omit for the full snapshot.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Dotted path like 'living_room.music' or omit for full snapshot" },
    },
  },
  execute: async (args, ctx) => {
    const snapshot = await ctx.world.snapshot();
    if (!args.path) {
      return { tool: "query_state", ok: true, message: "world snapshot", state: snapshot };
    }
    const [room, device] = args.path.split(".");
    if (!room || !snapshot[room]) {
      return { tool: "query_state", ok: true, message: `nothing known about '${args.path}'`, state: null };
    }
    if (!device) {
      return { tool: "query_state", ok: true, message: `state for ${room}`, state: snapshot[room] };
    }
    const slice = snapshot[room][device];
    if (!slice) {
      return { tool: "query_state", ok: true, message: `nothing known about '${args.path}'`, state: null };
    }
    return { tool: "query_state", ok: true, message: describeState(room, device, slice.state), state: slice };
  },
};

function describeState(room: string, device: string, state: Record<string, unknown>): string {
  const prettyRoom = room.replace(/_/g, " ");
  if (/(sky_?light|blind|shade)/.test(device)) {
    const position = typeof state["position"] === "number" ? state["position"] : null;
    const open = state["open"];
    if (position !== null) return `The ${prettyRoom} ${device} is ${position}% open.`;
    if (open === true) return `The ${prettyRoom} ${device} is open.`;
    if (open === false) return `The ${prettyRoom} ${device} is closed.`;
  }

  if (device === "lights") {
    const on = state["on"];
    const brightness = typeof state["brightness"] === "number" ? state["brightness"] : null;
    if (on === true) return `The ${prettyRoom} lights are on${brightness !== null ? ` at ${brightness}%` : ""}.`;
    if (on === false) return `The ${prettyRoom} lights are off.`;
    if (brightness !== null) return `The ${prettyRoom} lights are at ${brightness}%.`;
  }

  if (device === "music") {
    const playing = state["playing"] === true || state["playState"] === "PLAYING";
    const track = typeof state["track"] === "string" ? state["track"] : null;
    const artist = typeof state["artist"] === "string" ? state["artist"] : null;
    if (playing && track) {
      return `${artist ? `${track} by ${artist}` : track} is playing in the ${prettyRoom}.`;
    }
    return playing ? `Music is playing in the ${prettyRoom}.` : `Nothing is playing in the ${prettyRoom}.`;
  }

  const current = typeof state["current_f"] === "number" ? state["current_f"] : null;
  const target = typeof state["target_f"] === "number" ? state["target_f"] : null;
  if (current !== null || target !== null) {
    const parts: string[] = [];
    if (current !== null) parts.push(`${current} degrees`);
    if (target !== null) parts.push(`target ${target}`);
    return `The ${prettyRoom} ${device.replace(/_/g, " ")} is ${parts.join(", ")}.`;
  }

  return `state for ${room}.${device}`;
}
