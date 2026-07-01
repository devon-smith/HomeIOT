import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry, type ToolContext } from "./registry.js";
import { queryState } from "./tools/query_state.js";
import { type Bus, type StateMessage } from "../core/bus.js";
import { type World } from "../core/world.js";
import { type House } from "../core/house.js";
import { type Scheduler } from "../core/scheduler.js";

const baseMsg = (state: Record<string, unknown>): StateMessage => ({
  ts: "2026-07-01T00:00:00.000Z",
  source: "test",
  online: true,
  _cmd_id: null,
  pending: false,
  state,
});

const snapshot: Record<string, Record<string, StateMessage>> = {
  kitchen: {
    skylight: baseMsg({ position: 73, open: true }),
    lights: baseMsg({ on: true, brightness: 40 }),
    music: baseMsg({ playing: true, track: "Smooth Jazz", artist: "House Band" }),
  },
  backyard: {
    hot_tub: baseMsg({ current_f: 99, target_f: 102, mode: "heat" }),
  },
  theater: {
    av: baseMsg({ power: true, current_source: "apple_tv", volume: 35 }),
  },
  upstairs_hvac: {
    hvac_upstairs: baseMsg({ current_f: 72 }),
  },
};

function ctx(): ToolContext {
  const registry = new ToolRegistry();
  registry.register(queryState);
  return {
    bus: {} as Bus,
    world: { snapshot: async () => snapshot } as World,
    house: { timezone: "America/Los_Angeles", rooms: {}, zones: {}, actors: {} } as House,
    scenes: {},
    scheduler: {} as Scheduler,
    registry,
    actor: "test",
  };
}

describe("query_state spoken summaries", () => {
  it("summarizes skylight position", async () => {
    const result = await queryState.execute({ path: "kitchen.skylight" }, ctx());
    assert.equal(result.message, "The kitchen skylight is 73% open.");
  });

  it("summarizes lights state", async () => {
    const result = await queryState.execute({ path: "kitchen.lights" }, ctx());
    assert.equal(result.message, "The kitchen lights are on at 40%.");
  });

  it("summarizes music state", async () => {
    const result = await queryState.execute({ path: "kitchen.music" }, ctx());
    assert.equal(result.message, "Smooth Jazz by House Band is playing in the kitchen.");
  });

  it("summarizes climate state", async () => {
    const result = await queryState.execute({ path: "backyard.hot_tub" }, ctx());
    assert.equal(result.message, "The backyard hot tub is 99 degrees, target 102.");
  });

  it("summarizes AV playback state", async () => {
    const result = await queryState.execute({ path: "theater.av" }, ctx());
    assert.equal(result.message, "The theater AV is on and playing apple tv at volume 35.");
  });

  it("summarizes HVAC state without repeating the device slug", async () => {
    const result = await queryState.execute({ path: "upstairs_hvac.hvac_upstairs" }, ctx());
    assert.equal(result.message, "The UPSTAIRS HVAC is 72 degrees.");
  });
});
