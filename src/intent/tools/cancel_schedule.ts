import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z.object({
  id: z.string().optional().describe("Job id (uuid). If omitted, label_match or the earliest pending job is used."),
  label_match: z.string().optional().describe("Substring to find a pending job by label, when no id is known."),
});

type Args = z.infer<typeof schema>;

export const cancelSchedule: ToolDef<Args> = {
  name: "cancel_schedule",
  description:
    "Cancel a pending scheduled job. Use id when known, or label_match to find the earliest pending job whose label contains that phrase.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Job uuid (optional)" },
      label_match: { type: "string", description: "Substring of the job label (optional)" },
    },
  },
  execute: async (args, ctx) => {
    let targetId = args.id;
    let targetLabel: string | undefined;
    if (!targetId) {
      const jobs = await ctx.scheduler.list();
      const candidates = jobs
        .filter((j) => !args.label_match || (j.label ?? "").toLowerCase().includes(args.label_match.toLowerCase()))
        .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
      if (!candidates.length) {
        return {
          tool: "cancel_schedule",
          ok: false,
          message: args.label_match ? `no pending job matches '${args.label_match}'` : "no pending jobs to cancel",
        };
      }
      targetId = candidates[0]!.id;
      targetLabel = candidates[0]!.label;
    }

    await ctx.scheduler.cancel(targetId);
    return {
      tool: "cancel_schedule",
      ok: true,
      message: `Cancelled ${targetLabel ? `'${targetLabel}'` : `job ${targetId}`}.`,
      state: { id: targetId, label: targetLabel ?? null },
    };
  },
};
