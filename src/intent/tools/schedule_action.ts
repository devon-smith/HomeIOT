import { z } from "zod";
import { v4 as uuid } from "uuid";
import { type ToolDef } from "../registry.js";

const ActionSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
});

const schema = z.object({
  when: z.string().describe("ISO 8601 datetime with timezone offset"),
  actions: z.array(ActionSchema).min(1),
  label: z.string().optional(),
});

type Args = z.infer<typeof schema>;

const FORBIDDEN_NESTED = new Set(["schedule_action"]);

export const scheduleAction: ToolDef<Args> = {
  name: "schedule_action",
  description:
    "Schedule one or more tool calls to fire at a future time. Use for 'warm the hot tub for 9pm', 'turn off lights at midnight', etc. Each action is validated against its tool's schema before scheduling.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      when: {
        type: "string",
        description: "ISO 8601 timestamp with tz offset, e.g. '2026-05-23T21:00:00-07:00'",
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tool: { type: "string" },
            args: { type: "object", description: "Tool arguments — pass {} if none required" },
          },
          required: ["tool", "args"],
        },
      },
      label: { type: "string", description: "User-visible name, e.g. 'warm hot tub for 9pm'" },
    },
    required: ["when", "actions"],
  },
  execute: async (args, ctx) => {
    const when = new Date(args.when);
    if (isNaN(when.getTime())) {
      return { tool: "schedule_action", ok: false, message: `invalid 'when': ${args.when}` };
    }
    if (when.getTime() <= Date.now()) {
      return { tool: "schedule_action", ok: false, message: `'when' must be in the future` };
    }

    for (const action of args.actions) {
      if (FORBIDDEN_NESTED.has(action.tool)) {
        return { tool: "schedule_action", ok: false, message: `cannot schedule '${action.tool}' (forbidden nested call)` };
      }
      const def = ctx.registry.get(action.tool);
      if (!def) {
        return { tool: "schedule_action", ok: false, message: `unknown tool: ${action.tool}` };
      }
      const parsed = def.schema.safeParse(action.args);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return { tool: "schedule_action", ok: false, message: `validation failed for ${action.tool}: ${issues}` };
      }
    }

    const jobId = uuid();
    await ctx.scheduler.schedule({
      id: jobId,
      fireAt: when,
      actions: args.actions.map((a) => ({ tool: a.tool, args: a.args })),
      label: args.label,
      actor: ctx.actor,
    });

    const delaySec = Math.round((when.getTime() - Date.now()) / 1000);
    const labelText = args.label ? ` '${args.label}'` : "";
    return {
      tool: "schedule_action",
      ok: true,
      message: `Scheduled${labelText} for ${when.toISOString()} (in ${delaySec}s).`,
      state: { jobId, fireAt: when.toISOString(), actions: args.actions.length },
    };
  },
};
