import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    room: z.string().describe("Room slug like 'living_room'"),
    action: z.enum(["play", "pause", "resume", "next", "previous"]).optional(),
    query: z.string().optional(),
    uri: z.string().optional(),
    volume: z.number().int().min(0).max(100).optional(),
  })
  .refine((v) => v.action || v.query || v.uri || v.volume !== undefined, {
    message: "at least one of action, query, uri, or volume required",
  });

type Args = z.infer<typeof schema>;

export const setMusic: ToolDef<Args> = {
  name: "set_music",
  description:
    "Control music in a room: start a query, pause/resume, skip tracks, or set volume. Use 'query' for free-text searches like 'jazz rock' and 'uri' for explicit URIs.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      room: { type: "string", description: "Room slug (e.g. 'living_room', 'kitchen')" },
      action: { type: "string", enum: ["play", "pause", "resume", "next", "previous"] },
      query: { type: "string", description: "Free-text search like 'jazz rock' or 'evening playlist'" },
      uri: { type: "string", description: "Explicit URI like 'spotify:playlist:abc'" },
      volume: { type: "number", description: "Volume 0-100" },
    },
    required: ["room"],
  },
  execute: async (args, ctx) => {
    const room = ctx.house.rooms[args.room];
    if (!room) {
      return { tool: "set_music", ok: false, message: `unknown room '${args.room}'` };
    }
    if (!room.devices["music"]) {
      return { tool: "set_music", ok: false, message: `no music device in room '${args.room}'` };
    }

    let op: string;
    const cmdArgs: Record<string, unknown> = {};
    if (args.query) {
      op = "play";
      cmdArgs["query"] = args.query;
    } else if (args.uri) {
      op = "play";
      cmdArgs["uri"] = args.uri;
    } else if (args.action) {
      op = args.action;
    } else if (args.volume !== undefined) {
      op = "set_volume";
      cmdArgs["value"] = args.volume;
    } else {
      return { tool: "set_music", ok: false, message: "no action determined" };
    }
    if (args.volume !== undefined && op !== "set_volume") {
      cmdArgs["volume"] = args.volume;
    }

    const cmdId = ctx.bus.publishCommand(args.room, "music", op, cmdArgs, ctx.actor);
    try {
      const echo = await ctx.bus.waitForCommand(cmdId, 5000);
      const state = echo.state as Record<string, unknown>;
      const msg = describe(op, args.room, state);
      return { tool: "set_music", ok: true, message: msg, state };
    } catch {
      return {
        tool: "set_music",
        ok: false,
        message: `${args.room} music adapter did not confirm within 5s`,
      };
    }
  },
};

function describe(op: string, room: string, state: Record<string, unknown>): string {
  const track = state["track"] as string | undefined;
  const artist = state["artist"] as string | undefined;
  const volume = state["volume"] as number | undefined;
  switch (op) {
    case "play":
      return track
        ? `Playing ${artist ? `'${track}' by ${artist}` : `'${track}'`} in the ${room.replace(/_/g, " ")}.`
        : `Started music in the ${room.replace(/_/g, " ")}.`;
    case "pause":
      return `Paused music in the ${room.replace(/_/g, " ")}.`;
    case "resume":
      return `Resumed music in the ${room.replace(/_/g, " ")}.`;
    case "next":
      return track ? `Next: '${track}' in the ${room.replace(/_/g, " ")}.` : `Skipped to next.`;
    case "previous":
      return track ? `Previous: '${track}' in the ${room.replace(/_/g, " ")}.` : `Went back.`;
    case "set_volume":
      return `Volume in the ${room.replace(/_/g, " ")} is now ${volume ?? "?"}.`;
    default:
      return `${op} in ${room}.`;
  }
}
