import { z } from "zod";
import { type ToolDef } from "../registry.js";
import { type ExecutionResult } from "../types.js";

const schema = z.object({
  scene: z.string(),
  room: z.string().optional(),
});

type Args = z.infer<typeof schema>;

/**
 * Runs a brain-owned cross-vendor scene composition from config/scenes.yaml.
 * Each step in the scene is itself a tool call (including possibly
 * run_c4_scene). Steps execute in parallel — they are declared independent;
 * if a scene needs sequencing it should be split into multiple scenes or
 * encoded with explicit dependencies in a future revision.
 */
export const runScene: ToolDef<Args> = {
  name: "run_scene",
  description:
    "Run a brain-defined cross-vendor scene from config/scenes.yaml. Each step in the scene is its own tool call, run in parallel. For Composer-defined Control4 scenes use run_c4_scene.",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      scene: { type: "string", description: "Scene slug" },
      room: { type: "string", description: "Optional room context for room-scoped scenes" },
    },
    required: ["scene"],
  },
  execute: async (args, ctx) => {
    const scene = ctx.scenes[args.scene];
    if (!scene) {
      const available = Object.keys(ctx.scenes).sort().join(", ") || "(none)";
      return { tool: "run_scene", ok: false, message: `unknown scene '${args.scene}'. Available: ${available}` };
    }

    if (args.room && scene.rooms.length > 0 && !scene.rooms.includes(args.room)) {
      return {
        tool: "run_scene",
        ok: false,
        message: `scene '${args.scene}' is scoped to [${scene.rooms.join(", ")}] but invoked for '${args.room}'`,
      };
    }

    const stepResults: ExecutionResult[] = await Promise.all(
      scene.actions.map((action) => ctx.registry.run({ tool: action.tool, args: action.args }, ctx)),
    );

    const failed = stepResults.filter((r) => !r.ok);
    if (failed.length === 0) {
      return {
        tool: "run_scene",
        ok: true,
        message: `Ran '${scene.name}' (${stepResults.length} steps).`,
        state: { steps: stepResults },
      };
    }
    return {
      tool: "run_scene",
      ok: false,
      message: `Scene '${scene.name}' had ${failed.length}/${stepResults.length} failed step(s): ${failed.map((f) => `${f.tool}: ${f.message}`).join("; ")}`,
      state: { steps: stepResults },
    };
  },
};
