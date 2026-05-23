import { z } from "zod";
import { type ToolDef } from "../registry.js";
import { type House } from "../../core/house.js";

const schema = z
  .object({
    zone: z.string().describe("Climate zone slug — e.g. 'hot_tub', 'sauna', 'hvac_main'"),
    target_f: z.number().min(40).max(220).optional(),
    mode: z.enum(["heat", "cool", "off", "auto"]).optional(),
  })
  .refine((v) => v.target_f !== undefined || v.mode !== undefined, {
    message: "at least one of target_f or mode required",
  });

type Args = z.infer<typeof schema>;

/**
 * Resolve a climate zone name to a (room, device) pair. Searches every room's
 * devices for a slug matching `zone`. Returns null if missing or ambiguous.
 */
function resolveZone(house: House, zone: string): { room: string; device: string } | null {
  const matches: Array<{ room: string; device: string }> = [];
  for (const [room, def] of Object.entries(house.rooms)) {
    if (def.devices[zone]) matches.push({ room, device: zone });
  }
  if (matches.length === 1) return matches[0]!;
  return null;
}

export const setClimate: ToolDef<Args> = {
  name: "set_climate",
  description:
    "Set the target temperature or mode for a climate zone (hot tub, sauna, HVAC, etc.). Provide target_f for a target temperature; mode is 'heat' | 'cool' | 'off' | 'auto'.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      zone: { type: "string", description: "Climate zone (e.g. 'hot_tub', 'sauna', 'hvac_main')" },
      target_f: { type: "number", description: "Target temperature in Fahrenheit" },
      mode: { type: "string", enum: ["heat", "cool", "off", "auto"] },
    },
    required: ["zone"],
  },
  execute: async (args, ctx) => {
    const resolved = resolveZone(ctx.house, args.zone);
    if (!resolved) {
      return { tool: "set_climate", ok: false, message: `unknown or ambiguous climate zone '${args.zone}'` };
    }
    const { room, device } = resolved;

    // Mode first, then target — mode change might be a precondition for the heater.
    const ops: Array<{ op: string; args: Record<string, unknown> }> = [];
    if (args.mode !== undefined) ops.push({ op: "set_mode", args: { mode: args.mode } });
    if (args.target_f !== undefined) ops.push({ op: "set_target", args: { target_f: args.target_f } });

    let lastState: Record<string, unknown> | undefined;
    for (const { op, args: opArgs } of ops) {
      const cmdId = ctx.bus.publishCommand(room, device, op, opArgs, ctx.actor);
      try {
        const echo = await ctx.bus.waitForCommand(cmdId, 60_000);
        lastState = echo.state;
      } catch {
        return {
          tool: "set_climate",
          ok: false,
          message: `${args.zone} adapter did not confirm '${op}' within 60s`,
        };
      }
    }

    return {
      tool: "set_climate",
      ok: true,
      message: describe(args, lastState),
      state: lastState,
    };
  },
};

function describe(args: Args, state: Record<string, unknown> | undefined): string {
  const zone = args.zone.replace(/_/g, " ");
  if (args.target_f !== undefined) {
    const current = state?.["current_f"] as number | undefined;
    const eta = current !== undefined ? ` — currently ${current}°F` : "";
    return `Set ${zone} target to ${args.target_f}°F${eta}.`;
  }
  if (args.mode !== undefined) {
    return `Set ${zone} mode to ${args.mode}.`;
  }
  return `Updated ${zone}.`;
}
