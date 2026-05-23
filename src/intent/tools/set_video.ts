import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    room: z.string(),
    on: z.boolean().optional(),
    input: z.string().optional(),
    volume: z.number().int().min(0).max(100).optional(),
    muted: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.on !== undefined ||
      v.input !== undefined ||
      v.volume !== undefined ||
      v.muted !== undefined,
    { message: "at least one of on, input, volume, or muted required" },
  );

type Args = z.infer<typeof schema>;

export const setVideo: ToolDef<Args> = {
  name: "set_video",
  description:
    "Control the TV in a room: power on/off, switch input (e.g. 'apple_tv', 'hdmi1'), set volume, or mute.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      room: { type: "string", description: "Room slug" },
      on: { type: "boolean" },
      input: { type: "string", description: "Input source — e.g. 'apple_tv', 'hdmi1'" },
      volume: { type: "number", description: "0-100" },
      muted: { type: "boolean" },
    },
    required: ["room"],
  },
  execute: async (args, ctx) => {
    const room = ctx.house.rooms[args.room];
    if (!room) {
      return { tool: "set_video", ok: false, message: `unknown room '${args.room}'` };
    }
    if (!room.devices["tv"]) {
      return { tool: "set_video", ok: false, message: `no tv in room '${args.room}'` };
    }

    const cmdArgs: Record<string, unknown> = {};
    if (args.on !== undefined) cmdArgs["on"] = args.on;
    if (args.input !== undefined) cmdArgs["input"] = args.input;
    if (args.volume !== undefined) cmdArgs["volume"] = args.volume;
    if (args.muted !== undefined) cmdArgs["muted"] = args.muted;

    const cmdId = ctx.bus.publishCommand(args.room, "tv", "set", cmdArgs, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 10_000);
      return { tool: "set_video", ok: true, message: describe(args, args.room), state: echo.state };
    } catch {
      return {
        tool: "set_video",
        ok: false,
        message: `${args.room} TV adapter did not confirm within 10s`,
      };
    }
  },
};

function describe(args: Args, room: string): string {
  const pretty = room.replace(/_/g, " ");
  if (args.on === false) return `Turned off the ${pretty} TV.`;
  const parts: string[] = [];
  if (args.on === true) parts.push("on");
  if (args.input) parts.push(`input ${args.input}`);
  if (args.volume !== undefined) parts.push(`volume ${args.volume}`);
  if (args.muted !== undefined) parts.push(args.muted ? "muted" : "unmuted");
  return `Set the ${pretty} TV: ${parts.join(", ")}.`;
}
