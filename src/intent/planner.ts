import { type ToolContext } from "./registry.js";
import { type ToolCall, type ExecutionResult, type CacheStats } from "./types.js";

/** Output from a single planning round-trip. */
export interface PlannerOutput {
  toolCalls: ToolCall[];
  results: ExecutionResult[];
  response: string;
  cacheStats?: CacheStats;
}

/**
 * The planner takes a user message and produces a response. It owns the loop of
 * Claude tool_use round-trips — calls tools via the registry on ctx, returns
 * once Claude stops requesting tools.
 *
 * Implementation lands in M1 step 2 (see ./planner-claude.ts).
 */
export interface Planner {
  plan(text: string, actor: string, ctx: ToolContext): Promise<PlannerOutput>;
}
