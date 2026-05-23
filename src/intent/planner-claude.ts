import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { log } from "../core/log.js";
import { type House } from "../core/house.js";
import { type World } from "../core/world.js";
import { type ToolRegistry, type ToolContext } from "./registry.js";
import { type Planner, type PlannerOutput } from "./planner.js";
import { type ToolCall, type ExecutionResult } from "./types.js";

const MAX_TURNS = 6;
const MAX_TOKENS = 4096;

export interface ClaudePlannerDeps {
  registry: ToolRegistry;
  house: House;
  world: World;
}

/**
 * Claude planner with prompt caching baked in from day one.
 *
 * Cache layout (see ARCHITECTURE.md "Prompt caching layout"):
 *   tools                        ── render first, covered by the system breakpoints
 *   system[0]: persona           ── cache breakpoint #1 (rarely changes)
 *   system[1]: house definition  ── cache breakpoint #2 (changes when house.yaml changes)
 *   messages:
 *     user: world state snapshot ── volatile, not cached
 *     user: actual user message  ── volatile, not cached
 *
 * The house definition is serialized with sorted keys for stability — any
 * non-deterministic ordering would silently bust the cache.
 */
export class ClaudePlanner implements Planner {
  private client: Anthropic;
  private model: string;

  constructor(deps: ClaudePlannerDeps, apiKey: string, model = config.ANTHROPIC_MODEL_DEFAULT) {
    this.deps = deps;
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  private deps: ClaudePlannerDeps;

  async plan(text: string, actor: string, ctx: ToolContext): Promise<PlannerOutput> {
    const tools = this.buildTools();
    const system = this.buildSystem(actor);
    const stateSnapshot = await this.buildStateSnapshot();

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: `Current world state:\n${stateSnapshot}` },
      { role: "user", content: text },
    ];

    const allToolCalls: ToolCall[] = [];
    const allResults: ExecutionResult[] = [];
    let userVisibleText = "";
    const stats = { cacheCreationInputTokens: 0, cacheReadInputTokens: 0, inputTokens: 0, outputTokens: 0 };

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system,
          tools,
          messages,
        });
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
          log.warn({ err: err.message }, "planner rate limited");
          return {
            toolCalls: allToolCalls,
            results: allResults,
            response: "The LLM planner is rate-limited right now. Try again in a moment, or use a simpler command.",
          };
        }
        if (err instanceof Anthropic.APIError) {
          log.error({ status: err.status, message: err.message }, "planner API error");
          return {
            toolCalls: allToolCalls,
            results: allResults,
            response: `Planner error (${err.status}). Try again or use a fast-path command.`,
          };
        }
        throw err;
      }

      stats.cacheCreationInputTokens += response.usage.cache_creation_input_tokens ?? 0;
      stats.cacheReadInputTokens += response.usage.cache_read_input_tokens ?? 0;
      stats.inputTokens += response.usage.input_tokens;
      stats.outputTokens += response.usage.output_tokens;

      for (const block of response.content) {
        if (block.type === "text") {
          userVisibleText += (userVisibleText ? "\n" : "") + block.text;
        }
      }

      if (response.stop_reason === "end_turn") break;

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          const call: ToolCall = { tool: tu.name, args: tu.input as Record<string, unknown> };
          allToolCalls.push(call);
          const result = await this.deps.registry.run(call, ctx);
          allResults.push(result);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ ok: result.ok, message: result.message, state: result.state ?? null }),
            is_error: !result.ok,
          });
        }
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      if (response.stop_reason === "refusal") {
        log.warn({ stop_details: response.stop_reason }, "planner refused");
        if (!userVisibleText) userVisibleText = "I can't help with that.";
        break;
      }

      log.warn({ stop_reason: response.stop_reason }, "planner stopped unexpectedly");
      break;
    }

    log.info(
      {
        turns: allToolCalls.length > 0 ? allToolCalls.length : 1,
        cacheHit: stats.cacheReadInputTokens,
        cacheWrite: stats.cacheCreationInputTokens,
        in: stats.inputTokens,
        out: stats.outputTokens,
      },
      "planner done",
    );

    return {
      toolCalls: allToolCalls,
      results: allResults,
      response: userVisibleText || "Done.",
      cacheStats: stats,
    };
  }

  private buildSystem(actor: string): Anthropic.TextBlockParam[] {
    const persona = [
      `You are Home Brain, a natural-language orchestrator for a Bay Area smart home. The current actor is "${actor}".`,
      "",
      "Your job:",
      "- Understand the user's intent and call the right tools to make it happen.",
      "- Be concise. Replies to the user are one or two sentences max.",
      "- Only use the listed tools and only reference rooms and devices that appear in the house definition.",
      "- If a request is compound (e.g. \"warm the hot tub and start music\"), call multiple tools as needed.",
      "- If you cannot fulfill a request, say so plainly and explain what's missing.",
      "- If a tool result returns ok:false, do not silently retry — surface the failure to the user.",
      `- Today's timezone is ${this.deps.house.timezone}. Resolve relative times against the current local time.`,
    ].join("\n");

    const houseDef = this.serializeHouse();

    return [
      { type: "text", text: persona, cache_control: { type: "ephemeral" } },
      { type: "text", text: houseDef, cache_control: { type: "ephemeral" } },
    ];
  }

  private serializeHouse(): string {
    const lines: string[] = ["# House definition", "", "## Rooms"];
    const rooms = Object.entries(this.deps.house.rooms).sort(([a], [b]) => a.localeCompare(b));
    for (const [slug, def] of rooms) {
      lines.push(`- ${slug} (${def.label})`);
      const devices = Object.entries(def.devices).sort(([a], [b]) => a.localeCompare(b));
      for (const [dslug, ddef] of devices) {
        lines.push(`    - ${dslug} (adapter: ${ddef.adapter})`);
      }
    }
    if (Object.keys(this.deps.house.zones).length) {
      lines.push("", "## Zones");
      const zones = Object.entries(this.deps.house.zones).sort(([a], [b]) => a.localeCompare(b));
      for (const [zslug, members] of zones) {
        lines.push(`- ${zslug}: ${[...members].sort().join(", ")}`);
      }
    }
    return lines.join("\n");
  }

  private async buildStateSnapshot(): Promise<string> {
    const snapshot = await this.deps.world.snapshot();
    if (Object.keys(snapshot).length === 0) return "(no devices reporting state yet)";
    const compact: Record<string, Record<string, unknown>> = {};
    for (const [room, devices] of Object.entries(snapshot)) {
      compact[room] = {};
      for (const [device, msg] of Object.entries(devices)) {
        compact[room]![device] = {
          ...msg.state,
          ...(msg.pending ? { _pending: true } : {}),
          ...(msg.online === false ? { _offline: true } : {}),
        };
      }
    }
    return JSON.stringify(compact, null, 2);
  }

  private buildTools(): Anthropic.Tool[] {
    return this.deps.registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
    }));
  }
}
