import { z } from "zod";
import { v4 as uuid } from "uuid";
import { type ToolDef } from "../registry.js";
import { nextSolar } from "../../core/solar.js";

const ActionSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
});

const schema = z
  .object({
    actions: z.array(ActionSchema).min(1),
    label: z.string().optional(),

    // Mutually exclusive "when" forms. Pick one.
    when: z.string().optional().describe("ISO 8601 datetime with timezone offset"),
    in_minutes: z.number().int().min(1).max(60 * 24 * 14).optional()
      .describe("Fire N minutes from now ('in 30 minutes', sleep timer)"),
    in_hours: z.number().min(1 / 60).max(24 * 14).optional()
      .describe("Fire N hours from now"),
    at_solar: z.enum(["sunrise", "sunset"]).optional()
      .describe("Fire at the next sunrise/sunset (requires house.location)"),
    solar_offset_minutes: z.number().int().min(-180).max(180).optional()
      .describe("Negative = before the event (e.g. -30 = 30 min before sunset)"),

    recurrence: z.enum(["daily", "weekdays", "weekends", "weekly"]).optional()
      .describe("Re-fire on this cadence. Without it, the job is one-shot."),
  })
  .refine(
    (v) =>
      v.when !== undefined ||
      v.in_minutes !== undefined ||
      v.in_hours !== undefined ||
      v.at_solar !== undefined,
    { message: "provide one of: when, in_minutes, in_hours, at_solar" },
  );

type Args = z.infer<typeof schema>;

const FORBIDDEN_NESTED = new Set(["schedule_action", "snooze_schedule", "cancel_schedule"]);

export const scheduleAction: ToolDef<Args> = {
  name: "schedule_action",
  description:
    "Schedule tool calls to fire at a future time. Use 'in_minutes'/'in_hours' for relative times ('in 30 minutes'), 'when' for an absolute ISO timestamp ('at 9pm'), or 'at_solar' for 'at sunrise'/'at sunset' (with optional offset). Set recurrence='daily'|'weekdays'|'weekends'|'weekly' for recurring jobs. Each action is validated against its tool's schema before scheduling.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tool: { type: "string" },
            args: { type: "object", description: "Tool arguments — pass {} if none" },
          },
          required: ["tool", "args"],
        },
      },
      label: { type: "string", description: "User-visible name, e.g. 'warm hot tub for 9pm'" },
      when: { type: "string", description: "ISO 8601 with tz offset" },
      in_minutes: { type: "number", description: "Fire N minutes from now" },
      in_hours: { type: "number", description: "Fire N hours from now" },
      at_solar: { type: "string", enum: ["sunrise", "sunset"], description: "Fire at next sunrise/sunset" },
      solar_offset_minutes: { type: "number", description: "Offset for at_solar; negative = before event" },
      recurrence: { type: "string", enum: ["daily", "weekdays", "weekends", "weekly"], description: "Recurrence pattern" },
    },
    required: ["actions"],
  },
  execute: async (args, ctx) => {
    let fireAt: Date;
    let triggerForJob: { kind: "sunrise" | "sunset"; offsetMinutes?: number } | undefined;
    if (args.in_minutes !== undefined) {
      fireAt = new Date(Date.now() + args.in_minutes * 60_000);
    } else if (args.in_hours !== undefined) {
      fireAt = new Date(Date.now() + args.in_hours * 3600_000);
    } else if (args.at_solar) {
      const loc = ctx.house.location;
      if (!loc) {
        return {
          tool: "schedule_action",
          ok: false,
          message: "at_solar requires house.location (lat/long) in house.yaml",
        };
      }
      fireAt = nextSolar(new Date(), args.at_solar, loc.latitude, loc.longitude, args.solar_offset_minutes ?? 0);
      triggerForJob = { kind: args.at_solar, offsetMinutes: args.solar_offset_minutes };
    } else {
      fireAt = new Date(args.when!);
      if (isNaN(fireAt.getTime())) {
        return { tool: "schedule_action", ok: false, message: `invalid 'when': ${args.when}` };
      }
    }
    if (fireAt.getTime() <= Date.now() && !args.recurrence && !triggerForJob) {
      return { tool: "schedule_action", ok: false, message: `fire time must be in the future` };
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
      fireAt,
      actions: args.actions.map((a) => ({ tool: a.tool, args: a.args })),
      label: args.label,
      actor: ctx.actor,
      recurrence: args.recurrence ?? null,
      trigger: triggerForJob,
    });

    const labelText = args.label ? ` '${args.label}'` : "";
    const recurText = args.recurrence ? ` (${args.recurrence})` : "";
    const solarText = triggerForJob
      ? ` (${triggerForJob.kind}${triggerForJob.offsetMinutes ? ` ${triggerForJob.offsetMinutes >= 0 ? "+" : ""}${triggerForJob.offsetMinutes}m` : ""})`
      : "";
    const local = fireAt.toLocaleString([], {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    return {
      tool: "schedule_action",
      ok: true,
      message: `Scheduled${labelText}${recurText}${solarText} for ${local}.`,
      state: { jobId, fireAt: fireAt.toISOString(), actions: args.actions.length, recurrence: args.recurrence ?? null },
    };
  },
};
