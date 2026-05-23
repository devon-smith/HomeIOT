import { type ToolRegistry } from "../registry.js";
import { setMusic } from "./set_music.js";
import { queryState } from "./query_state.js";
import { runScene } from "./run_scene.js";

/** Register the M1 tool set on the given registry. */
export function registerM1Tools(registry: ToolRegistry): void {
  registry.register(setMusic);
  registry.register(queryState);
  registry.register(runScene);
}
