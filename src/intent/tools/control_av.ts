import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    room: z.string().describe("Room slug (e.g. 'theater')"),
    device: z
      .string()
      .optional()
      .describe("Device slot (default: 'av')"),
    action: z.enum(["watch", "off", "volume", "mute", "unmute"]).describe(
      "watch a source, turn the room off, set volume, mute, or unmute",
    ),
    source: z
      .string()
      .optional()
      .describe("For action='watch': source name like 'apple_tv' / 'xfinity' / 'uhd' / 'xbox'"),
    level: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("For action='volume': 0-100"),
  })
  .refine((v) => v.action !== "watch" || v.source !== undefined, {
    message: "action='watch' requires source",
  })
  .refine((v) => v.action !== "volume" || v.level !== undefined, {
    message: "action='volume' requires level",
  });

type Args = z.infer<typeof schema>;

export const controlAv: ToolDef<Args> = {
  name: "control_av",
  description:
    "Control the Control4 AV system in a room: 'watch' to fire a source ('movie night' workflow — TV/projector + AVR + source select), 'off' for ROOM_OFF, 'volume' / 'mute' / 'unmute' for room audio. Theater is the main one; valid sources come from house.yaml under the av device's sources map.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      room: { type: "string", description: "Room slug" },
      device: { type: "string", description: "Device slot (default: 'av')" },
      action: {
        type: "string",
        enum: ["watch", "off", "volume", "mute", "unmute"],
      },
      source: { type: "string", description: "For watch: source name" },
      level: { type: "number", description: "For volume: 0-100" },
    },
    required: ["room", "action"],
  },
  execute: async (args, ctx) => {
    const room = ctx.house.rooms[args.room];
    if (!room) {
      return { tool: "control_av", ok: false, message: `unknown room '${args.room}'` };
    }
    const device = args.device ?? "av";
    if (!room.devices[device]) {
      return {
        tool: "control_av",
        ok: false,
        message: `no '${device}' device in room '${args.room}'`,
      };
    }

    let op: string;
    let opArgs: Record<string, unknown> = {};
    switch (args.action) {
      case "watch":
        op = "watch";
        opArgs = { source: args.source };
        break;
      case "off":
        op = "off";
        break;
      case "volume":
        op = "set_volume";
        opArgs = { level: args.level };
        break;
      case "mute":
        op = "set_mute";
        opArgs = { muted: true };
        break;
      case "unmute":
        op = "set_mute";
        opArgs = { muted: false };
        break;
    }

    const cmdId = ctx.bus.publishCommand(args.room, device, op, opArgs, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 15000);
      const state = echo.state as Record<string, unknown>;
      const pretty = args.room.replace(/_/g, " ");
      let msg: string;
      switch (args.action) {
        case "watch":
          msg = `Now watching ${args.source!.replace(/_/g, " ")} in the ${pretty}.`;
          break;
        case "off":
          msg = `Turned off the ${pretty}.`;
          break;
        case "volume":
          msg = `Set ${pretty} volume to ${args.level}%.`;
          break;
        case "mute":
          msg = `Muted the ${pretty}.`;
          break;
        case "unmute":
          msg = `Unmuted the ${pretty}.`;
          break;
      }
      return { tool: "control_av", ok: true, message: msg, state };
    } catch {
      return {
        tool: "control_av",
        ok: false,
        message: `${args.room}.${device} did not confirm within 15s`,
      };
    }
  },
};
