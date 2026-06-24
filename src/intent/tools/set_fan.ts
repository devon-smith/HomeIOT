import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    room: z.string(),
    on: z.boolean().optional(),
    brightness: z.number().int().min(0).max(100).optional(),
  })
  .refine((v) => v.on !== undefined || v.brightness !== undefined, {
    message: "at least one of on or brightness required",
  });

type Args = z.infer<typeof schema>;

export const setFan: ToolDef<Args> = {
  name: "set_fan",
  description:
    "Control a ceiling/exhaust fan in a room (separate from lights). " +
    "Set on/off or speed (brightness 0-100, where 100 = full speed). " +
    "Use this — NOT set_lights — when the user says 'fan'.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      room: { type: "string", description: "Room slug" },
      on: { type: "boolean" },
      brightness: { type: "number", description: "0-100 speed (100 = full)" },
    },
    required: ["room"],
  },
  execute: async (args, ctx) => {
    const room = ctx.house.rooms[args.room];
    if (!room) {
      return { tool: "set_fan", ok: false, message: `unknown room '${args.room}'` };
    }
    if (!room.devices["fan"]) {
      return { tool: "set_fan", ok: false, message: `no fan in room '${args.room}'` };
    }

    const cmdArgs: Record<string, unknown> = {};
    if (args.on !== undefined) cmdArgs["on"] = args.on;
    if (args.brightness !== undefined) cmdArgs["brightness"] = args.brightness;

    const cmdId = ctx.bus.publishCommand(args.room, "fan", "set", cmdArgs, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 10_000);
      const state = echo.state as Record<string, unknown>;
      return { tool: "set_fan", ok: true, message: describe(args, args.room, state), state };
    } catch {
      return {
        tool: "set_fan",
        ok: false,
        message: `${args.room} fan adapter did not confirm within 10s`,
      };
    }
  },
};

function describe(args: Args, room: string, state: Record<string, unknown>): string {
  const pretty = room.replace(/_/g, " ");
  const brightness = state["brightness"] as number | undefined;
  if (args.on === false) return `Turned off the ${pretty} fan.`;
  if (args.on === true) {
    return `Turned on the ${pretty} fan${brightness !== undefined ? ` at ${brightness}%` : ""}.`;
  }
  if (args.brightness !== undefined) return `Set ${pretty} fan to ${brightness ?? args.brightness}%.`;
  return `Updated ${pretty} fan.`;
}
