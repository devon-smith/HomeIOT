/**
 * Per-source policy for the voice / public surface.
 *
 * Today every tool we ship is non-destructive enough to permit unattended
 * voice control (lights, music, climate, scenes, schedule). The policy
 * lives here so when we add a door-lock / alarm-disable tool we can flip
 * a single switch instead of hunting through routes.
 *
 * Decision shape:
 *   { decision: 'allow' }                              → proceed
 *   { decision: 'block',   message: 'short reason' }   → return error
 *   { decision: 'confirm', message: 'ask for confirm' } → spoken back; user re-asks
 */

export type Source = "web" | "alexa" | "siri" | "imessage" | "api";

export interface SourceDecision {
  decision: "allow" | "block" | "confirm";
  message?: string;
}

/**
 * Heuristic over the raw text. Cheap pre-planner gate — catches the
 * obviously dangerous phrasing before the LLM gets the prompt. Per-tool
 * gating after the planner runs is the real defense; this just stops
 * the most obvious foot-guns.
 */
export function authorizeForSource(text: string, source: Source): SourceDecision {
  const t = (text || "").toLowerCase();

  // Voice can do basically everything we have today.
  // When we add door-locks / alarm-disable, list them here.
  const BLOCKED_FROM_VOICE: RegExp[] = [
    // /\bunlock\b.*\bdoor\b/i,
    // /\bdisable\b.*\b(alarm|security)\b/i,
  ];

  if (source === "alexa" || source === "siri") {
    for (const pat of BLOCKED_FROM_VOICE) {
      if (pat.test(t)) {
        return { decision: "block", message: "That command needs to be done in the app." };
      }
    }
  }

  return { decision: "allow" };
}

/**
 * Map a tool name → whether voice is allowed to call it without confirmation.
 * Called after the planner has produced its tool list but before execution.
 * Empty entry = default-allow.
 */
const TOOL_POLICY: Record<string, { voice?: "allow" | "block" | "confirm" }> = {
  // examples for the future:
  // door_unlock:   { voice: "block" },
  // arm_security:  { voice: "confirm" },
};

export function authorizeToolForSource(tool: string, source: Source): SourceDecision {
  const p = TOOL_POLICY[tool]?.voice ?? "allow";
  if (p === "allow") return { decision: "allow" };
  if (p === "confirm") return { decision: "confirm", message: `Please confirm — should I ${tool.replace(/_/g, " ")}?` };
  return { decision: "block", message: "That action isn't allowed by voice." };
}
