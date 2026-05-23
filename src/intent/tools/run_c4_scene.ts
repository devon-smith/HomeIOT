import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z.object({
  name: z.string(),
  room: z.string().optional(),
});

type Args = z.infer<typeof schema>;

/**
 * Fires a Composer-defined C4 scene by name. Routes to home/_house/c4/command
 * (or home/{room}/c4/command if a room is given for room-scoped scenes).
 */
export const runC4Scene: ToolDef<Args> = {
  name: "run_c4_scene",
  description:
    "Fire a Control4-internal scene that the dealer programmed in Composer (lighting presets, AVR routing, projector start-up). For brain-composed cross-vendor scenes use run_scene instead.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Composer-defined scene name" },
      room: { type: "string", description: "Optional room for room-scoped scenes" },
    },
    required: ["name"],
  },
  execute: async (args, ctx) => {
    const room = args.room ?? "_house";
    const cmdId = ctx.bus.publishCommand(room, "c4", "scene", { name: args.name }, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 10_000);
      const fired = echo.state["last_scene"] as string | undefined;
      if (fired === args.name) {
        return { tool: "run_c4_scene", ok: true, message: `Fired Control4 scene '${args.name}'.`, state: echo.state };
      }
      return {
        tool: "run_c4_scene",
        ok: false,
        message: `Control4 adapter responded but did not confirm scene '${args.name}' (last_scene=${fired ?? "?"})`,
      };
    } catch {
      return {
        tool: "run_c4_scene",
        ok: false,
        message: `Control4 adapter did not confirm scene '${args.name}' within 10s`,
      };
    }
  },
};
