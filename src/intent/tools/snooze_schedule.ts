import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z
  .object({
    id: z.string().optional().describe("Job id (uuid). If omitted, the most recent pending job is used."),
    label_match: z.string().optional().describe("Substring to find a pending job by label, when no id is known."),
    by_minutes: z.number().int().describe("Positive = later, negative = earlier."),
  })
  .refine((v) => v.by_minutes !== 0, { message: "by_minutes can't be zero" });

type Args = z.infer<typeof schema>;

export const snoozeSchedule: ToolDef<Args> = {
  name: "snooze_schedule",
  description:
    "Postpone or pull-forward a pending scheduled job. Use id when you know it, or label_match (substring) to find by name ('hot tub', 'goodnight'). by_minutes is positive to delay, negative to move earlier.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Job uuid (optional)" },
      label_match: { type: "string", description: "Substring of the job label (optional)" },
      by_minutes: { type: "number", description: "Delay (+) or pull-forward (-) in minutes" },
    },
    required: ["by_minutes"],
  },
  execute: async (args, ctx) => {
    let targetId = args.id;
    if (!targetId) {
      const jobs = await ctx.scheduler.list();
      const candidates = jobs
        .filter((j) => !args.label_match || (j.label ?? "").toLowerCase().includes(args.label_match.toLowerCase()))
        .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
      if (!candidates.length) {
        return {
          tool: "snooze_schedule",
          ok: false,
          message: args.label_match ? `no pending job matches '${args.label_match}'` : "no pending jobs to snooze",
        };
      }
      targetId = candidates[0]!.id;
    }
    const updated = await ctx.scheduler.snooze(targetId, args.by_minutes);
    if (!updated) {
      return { tool: "snooze_schedule", ok: false, message: `job ${targetId} not found or not pending` };
    }
    const local = updated.fireAt.toLocaleString([], {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const verb = args.by_minutes > 0 ? "pushed back" : "pulled forward";
    return {
      tool: "snooze_schedule",
      ok: true,
      message: `${updated.label ?? "Job"} ${verb} ${Math.abs(args.by_minutes)} min → ${local}.`,
      state: { id: updated.id, fireAt: updated.fireAt.toISOString() },
    };
  },
};
