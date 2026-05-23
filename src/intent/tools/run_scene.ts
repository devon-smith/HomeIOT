import { z } from "zod";
import { type ToolDef } from "../registry.js";

const schema = z.object({
  scene: z.string(),
  room: z.string().optional(),
});

type Args = z.infer<typeof schema>;

/**
 * M1 stub. The scene engine lands in M2; for now this returns ok:false so the
 * planner self-corrects rather than pretending it worked.
 */
export const runScene: ToolDef<Args> = {
  name: "run_scene",
  description: "Run a brain-defined cross-vendor scene from config/scenes.yaml. (Scene engine lands in M2.)",
  schema,
  inputSchema: {
    type: "object",
    properties: {
      scene: { type: "string" },
      room: { type: "string" },
    },
    required: ["scene"],
  },
  execute: async (args) => ({
    tool: "run_scene",
    ok: false,
    message: `scene engine lands in M2 — '${args.scene}' is recognized but cannot be executed yet`,
  }),
};
