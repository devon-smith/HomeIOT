import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    room: z.string().describe("Room slug"),
    device: z
      .string()
      .optional()
      .describe("Device slot (e.g. 'skylight', 'blinds'). Defaults to 'skylight'."),
    position: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("0 = fully closed, 100 = fully open"),
    action: z.enum(["open", "close"]).optional(),
  })
  .refine((v) => v.position !== undefined || v.action !== undefined, {
    message: "set_skylight requires either position or action",
  });

type Args = z.infer<typeof schema>;

export const setSkylight: ToolDef<Args> = {
  name: "set_skylight",
  description:
    "Open or close a motorized skylight or blind in a room. Use position (0=closed, 100=open) or the action 'open'/'close'.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      room: { type: "string", description: "Room slug" },
      device: {
        type: "string",
        description: "Device slot name (default: 'skylight')",
      },
      position: { type: "number", description: "0-100" },
      action: { type: "string", enum: ["open", "close"] },
    },
    required: ["room"],
  },
  execute: async (args, ctx) => {
    const room = ctx.house.rooms[args.room];
    if (!room) {
      return { tool: "set_skylight", ok: false, message: `unknown room '${args.room}'` };
    }
    const device = args.device ?? "skylight";
    if (!room.devices[device]) {
      return {
        tool: "set_skylight",
        ok: false,
        message: `no '${device}' device in room '${args.room}'`,
      };
    }

    const position =
      args.position ?? (args.action === "open" ? 100 : args.action === "close" ? 0 : 0);

    const cmdId = ctx.bus.publishCommand(args.room, device, "set", { position }, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 15000);
      const state = echo.state as Record<string, unknown>;
      const pretty = args.room.replace(/_/g, " ");
      const msg =
        position === 0
          ? `Closed the ${pretty} ${device}.`
          : position === 100
            ? `Opened the ${pretty} ${device}.`
            : `Set the ${pretty} ${device} to ${position}%.`;
      return { tool: "set_skylight", ok: true, message: msg, state };
    } catch {
      return {
        tool: "set_skylight",
        ok: false,
        message: `${args.room}.${device} did not confirm within 15s`,
      };
    }
  },
};
