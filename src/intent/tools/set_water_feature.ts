import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z.object({
  name: z.string().describe("Water-feature slug (e.g. 'fountain', 'pool_jets')"),
  on: z.boolean(),
});

type Args = z.infer<typeof schema>;

/**
 * Toggle a water feature on or off. Resolves `name` to a (room, device) pair
 * by searching house.rooms — water features are typically Tuya switches.
 */
export const setWaterFeature: ToolDef<Args> = {
  name: "set_water_feature",
  description: "Turn a water feature on or off — fountains, pool jets, misters, etc.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Slug — 'fountain', 'pool_jets', etc." },
      on: { type: "boolean" },
    },
    required: ["name", "on"],
  },
  execute: async (args, ctx) => {
    const matches: Array<{ room: string; device: string }> = [];
    for (const [room, def] of Object.entries(ctx.house.rooms)) {
      if (def.devices[args.name]) matches.push({ room, device: args.name });
    }
    if (matches.length === 0) {
      return { tool: "set_water_feature", ok: false, message: `unknown water feature '${args.name}'` };
    }
    if (matches.length > 1) {
      return {
        tool: "set_water_feature",
        ok: false,
        message: `ambiguous water feature '${args.name}' — found in rooms: ${matches.map((m) => m.room).join(", ")}`,
      };
    }
    const { room, device } = matches[0]!;
    const cmdId = ctx.bus.publishCommand(room, device, "set", { on: args.on }, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 10_000);
      const action = args.on ? "Turned on" : "Turned off";
      return {
        tool: "set_water_feature",
        ok: true,
        message: `${action} ${args.name.replace(/_/g, " ")} in the ${room.replace(/_/g, " ")}.`,
        state: echo.state,
      };
    } catch {
      return {
        tool: "set_water_feature",
        ok: false,
        message: `${args.name} adapter did not confirm within 10s`,
      };
    }
  },
};
