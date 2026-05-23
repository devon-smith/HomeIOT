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
    return { tool: "query_state", ok: true, message: `state for ${args.path}`, state: slice };
  },
};
