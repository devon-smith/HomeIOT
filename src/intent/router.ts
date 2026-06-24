import { type Bus } from "../core/bus.js";
import { type World } from "../core/world.js";
import { type House } from "../core/house.js";
import { type Scenes } from "../core/scenes.js";
import { type Scheduler } from "../core/scheduler.js";
import { log } from "../core/log.js";
import { normalize } from "./normalize.js";
import { classify } from "./classifier.js";
import { executeAll } from "./executor.js";
import { type ToolRegistry, type ToolContext } from "./registry.js";
import { type Planner } from "./planner.js";
import { type ExecutionResult, type IntentResult } from "./types.js";

export interface RouterDeps {
  bus: Bus;
  world: World;
  house: House;
  scenes: Scenes;
  scheduler: Scheduler;
  registry: ToolRegistry;
  planner: Planner | null;
}

export class Router {
  constructor(private deps: RouterDeps) {}

  async handle(text: string, actor: string): Promise<IntentResult> {
    const t0 = Date.now();
    const normalized = normalize(text);
    const ctx: ToolContext = {
      bus: this.deps.bus,
      world: this.deps.world,
      house: this.deps.house,
      scenes: this.deps.scenes,
      scheduler: this.deps.scheduler,
      registry: this.deps.registry,
      actor,
    };

    const fast = classify(normalized, this.deps.house);
    if (fast) {
      log.info({ pattern: fast.patternName, tool: fast.toolCall.tool }, "fast-path matched");
      const results = await executeAll([fast.toolCall], this.deps.registry, ctx);
      return {
        route: "fast",
        toolCalls: [fast.toolCall],
        results,
        response: composeResponse(results),
        latencyMs: Date.now() - t0,
      };
    }

    if (!this.deps.planner) {
      return {
        route: "error",
        toolCalls: [],
        results: [],
        response:
          "I didn't recognize that as a quick command and the LLM planner isn't configured. Set ANTHROPIC_API_KEY to enable richer parsing.",
        latencyMs: Date.now() - t0,
      };
    }

    const plan = await this.deps.planner.plan(text, actor, ctx);
    return {
      route: "llm",
      toolCalls: plan.toolCalls,
      results: plan.results,
      response: plan.response,
      latencyMs: Date.now() - t0,
      cacheStats: plan.cacheStats,
    };
  }
}

function composeResponse(results: ExecutionResult[]): string {
  if (results.length === 0) return "No actions taken.";
  if (results.every((r) => r.ok)) return results.map((r) => r.message).join(" ");
  const failed = results.filter((r) => !r.ok);
  const ok = results.filter((r) => r.ok);
  const parts: string[] = [];
  if (ok.length) parts.push(ok.map((r) => r.message).join(" "));
  parts.push(`Some steps failed: ${failed.map((r) => r.message).join("; ")}`);
  return parts.join(" ");
}
