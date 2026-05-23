import { type ToolCall, type ExecutionResult } from "./types.js";
import { type ToolRegistry, type ToolContext } from "./registry.js";

/**
 * Execute a sequence of tool calls. M1 runs sequentially; the parallel DAG
 * executor lands with the scene engine in M2.
 */
export async function executeAll(
  calls: ToolCall[],
  registry: ToolRegistry,
  ctx: ToolContext,
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  for (const call of calls) {
    results.push(await registry.run(call, ctx));
  }
  return results;
}
