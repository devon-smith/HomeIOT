import { type ToolRegistry } from "../registry.js";
import { setMusic } from "./set_music.js";
import { setLights } from "./set_lights.js";
import { setClimate } from "./set_climate.js";
import { setSkylight } from "./set_skylight.js";
import { setVideo } from "./set_video.js";
import { setWaterFeature } from "./set_water_feature.js";
import { controlAv } from "./control_av.js";
import { queryState } from "./query_state.js";
import { runScene } from "./run_scene.js";
import { runC4Scene } from "./run_c4_scene.js";
import { scheduleAction } from "./schedule_action.js";
import { snoozeSchedule } from "./snooze_schedule.js";

/** Register the M1+M2+M3+M4 tool set on the given registry. */
export function registerTools(registry: ToolRegistry): void {
  registry.register(setMusic);
  registry.register(setLights);
  registry.register(setClimate);
  registry.register(setSkylight);
  registry.register(setVideo);
  registry.register(setWaterFeature);
  registry.register(controlAv);
  registry.register(queryState);
  registry.register(runScene);
  registry.register(runC4Scene);
  registry.register(scheduleAction);
  registry.register(snoozeSchedule);
}

/** Back-compat alias. */
export const registerM1Tools = registerTools;
