import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { type Bus } from "../core/bus.js";
import { type House } from "../core/house.js";
import { type Scenes } from "../core/scenes.js";
import { type Scheduler } from "../core/scheduler.js";
import { type World } from "../core/world.js";
import { ToolRegistry, type ToolContext } from "./registry.js";

const house: House = {
  timezone: "America/Los_Angeles",
  rooms: {},
  zones: {},
  actors: {},
};

function ctx(registry: ToolRegistry, actor = "voice:alexa"): ToolContext {
  return {
    bus: {} as Bus,
    world: {} as World,
    house,
    scenes: {} as Scenes,
    scheduler: {} as Scheduler,
    registry,
    actor,
  };
}

describe("ToolRegistry source policy", () => {
  it("does not execute voice-blocked tools", async () => {
    const registry = new ToolRegistry();
    let executed = false;
    registry.register({
      name: "unlock_door",
      description: "test blocked tool",
      schema: z.object({}),
      inputSchema: {},
      execute: async () => {
        executed = true;
        return { tool: "unlock_door", ok: true, message: "unlocked" };
      },
    });

    const result = await registry.run({ tool: "unlock_door", args: {} }, ctx(registry));

    assert.equal(executed, false);
    assert.deepEqual(result, {
      tool: "unlock_door",
      ok: false,
      message: "That action isn't allowed by voice.",
    });
  });
});
