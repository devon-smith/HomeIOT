import { type ToolRegistry } from "../registry.js";
import { setMusic } from "./set_music.js";
import { setLights } from "./set_lights.js";
import { queryState } from "./query_state.js";
import { runScene } from "./run_scene.js";
import { runC4Scene } from "./run_c4_scene.js";

/** Register the M1+M2 tool set on the given registry. */
export function registerTools(registry: ToolRegistry): void {
  registry.register(setMusic);
  registry.register(setLights);
  registry.register(queryState);
  registry.register(runScene);
  registry.register(runC4Scene);
}

/** Back-compat alias. */
export const registerM1Tools = registerTools;
