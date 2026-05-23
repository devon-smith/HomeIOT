import { type z } from "zod";
import { type Bus } from "../core/bus.js";
import { type World } from "../core/world.js";
import { type House } from "../core/house.js";
import { type Scenes } from "../core/scenes.js";
import { type ToolCall, type ExecutionResult } from "./types.js";
import { log } from "../core/log.js";

export interface ToolContext {
  bus: Bus;
  world: World;
  house: House;
  scenes: Scenes;
  registry: ToolRegistry;
  actor: string;
}

export interface ToolDef<TArgs = unknown> {
  name: string;
  description: string;
  /** zod schema for runtime validation */
  schema: z.ZodSchema<TArgs>;
  /** JSON schema (subset) that the Anthropic API consumes */
  inputSchema: Record<string, unknown>;
  execute: (args: TArgs, ctx: ToolContext) => Promise<ExecutionResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef<unknown>>();

  register<T>(def: ToolDef<T>): void {
    this.tools.set(def.name, def as ToolDef<unknown>);
  }

  get(name: string): ToolDef<unknown> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDef<unknown>[] {
    return Array.from(this.tools.values());
  }

  async run(call: ToolCall, ctx: ToolContext): Promise<ExecutionResult> {
    const def = this.get(call.tool);
    if (!def) {
      return { tool: call.tool, ok: false, message: `unknown tool: ${call.tool}` };
    }
    const parsed = def.schema.safeParse(call.args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { tool: call.tool, ok: false, message: `validation: ${issues}` };
    }
    try {
      return await def.execute(parsed.data, ctx);
    } catch (err) {
      log.error({ err, tool: call.tool }, "tool execution error");
      return { tool: call.tool, ok: false, message: `execute error: ${(err as Error).message}` };
    }
  }
}
