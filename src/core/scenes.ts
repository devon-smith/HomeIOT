import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { log } from "./log.js";

const ActionSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()).default({}),
});

const SceneSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  rooms: z.array(z.string()).default([]),
  actions: z.array(ActionSchema).min(1),
});

const ScenesFileSchema = z.object({
  scenes: z.record(SceneSchema),
});

export type SceneAction = z.infer<typeof ActionSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Scenes = Record<string, Scene>;

/**
 * Load brain-owned scene compositions from config/scenes.yaml (or fall back to
 * config/scenes.example.yaml).
 *
 * Scenes are validated at load time — unknown tools, recursion (run_scene
 * inside a scene), and empty action lists fail fast rather than at execution
 * time.
 */
export function loadScenes(filePath?: string): Scenes {
  const resolved = filePath
    ?? (fs.existsSync(path.resolve("config/scenes.yaml"))
      ? path.resolve("config/scenes.yaml")
      : path.resolve("config/scenes.example.yaml"));

  if (!fs.existsSync(resolved)) {
    log.warn({ path: resolved }, "scenes file not found; no scenes loaded");
    return {};
  }

  log.info({ path: resolved }, "loading scenes");
  const raw = fs.readFileSync(resolved, "utf8");
  const data = yaml.load(raw);
  const parsed = ScenesFileSchema.parse(data);

  // Reject nested run_scene calls — recursion is a footgun.
  for (const [slug, scene] of Object.entries(parsed.scenes)) {
    for (const action of scene.actions) {
      if (action.tool === "run_scene") {
        throw new Error(`scene '${slug}' contains a nested run_scene call; nested scenes are not supported`);
      }
    }
  }

  return parsed.scenes;
}
