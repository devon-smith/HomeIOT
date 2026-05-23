import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    room: z.string(),
    on: z.boolean().optional(),
    brightness: z.number().int().min(0).max(100).optional(),
    scene: z.string().optional(),
  })
  .refine((v) => v.on !== undefined || v.brightness !== undefined || v.scene !== undefined, {
    message: "at least one of on, brightness, or scene required",
  });

type Args = z.infer<typeof schema>;

export const setLights: ToolDef<Args> = {
  name: "set_lights",
  description:
    "Control lights in a room. Set on/off, brightness (0-100), or fire a named room-scoped lighting scene defined in Control4 Composer.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      room: { type: "string", description: "Room slug" },
      on: { type: "boolean" },
      brightness: { type: "number", description: "0-100" },
      scene: { type: "string", description: "Named room-scoped scene (Composer-defined)" },
    },
    required: ["room"],
  },
  execute: async (args, ctx) => {
    const room = ctx.house.rooms[args.room];
    if (!room) {
      return { tool: "set_lights", ok: false, message: `unknown room '${args.room}'` };
    }
    if (!room.devices["lights"]) {
      return { tool: "set_lights", ok: false, message: `no lights in room '${args.room}'` };
    }

    const op = args.scene ? "scene" : "set";
    const cmdArgs: Record<string, unknown> = {};
    if (args.scene) cmdArgs["name"] = args.scene;
    if (args.on !== undefined) cmdArgs["on"] = args.on;
    if (args.brightness !== undefined) cmdArgs["brightness"] = args.brightness;

    const cmdId = ctx.bus.publishCommand(args.room, "lights", op, cmdArgs, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 5000);
      const state = echo.state as Record<string, unknown>;
      return { tool: "set_lights", ok: true, message: describe(args, args.room, state), state };
    } catch {
      return {
        tool: "set_lights",
        ok: false,
        message: `${args.room} lights adapter did not confirm within 5s`,
      };
    }
  },
};

function describe(args: Args, room: string, state: Record<string, unknown>): string {
  const pretty = room.replace(/_/g, " ");
  if (args.scene) return `Set ${pretty} lights to scene '${args.scene}'.`;
  const on = state["on"] as boolean | undefined;
  const brightness = state["brightness"] as number | undefined;
  if (args.on === false) return `Turned off the ${pretty} lights.`;
  if (args.on === true) return `Turned on the ${pretty} lights${brightness !== undefined ? ` at ${brightness}%` : ""}.`;
  if (args.brightness !== undefined) return `Set ${pretty} lights to ${brightness ?? args.brightness}%.`;
  return `Updated ${pretty} lights (on: ${on}, brightness: ${brightness}).`;
}
