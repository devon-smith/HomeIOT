import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { type House } from "../core/house.js";
import { type Scenes } from "../core/scenes.js";
import { type Bus } from "../core/bus.js";
import { type World } from "../core/world.js";
import { type Scheduler } from "../core/scheduler.js";
import { Router } from "./router.js";
import { ToolRegistry } from "./registry.js";
import { type ToolCall } from "./types.js";
import { type Planner } from "./planner.js";

const house: House = {
  timezone: "America/Los_Angeles",
  rooms: {
    kitchen: {
      label: "Kitchen",
      devices: {
        music: { adapter: "sonos", config: {} },
        lights: { adapter: "control4", config: {} },
        skylight: { adapter: "control4", config: {} },
      },
    },
    family_room: {
      label: "Family Room",
      devices: {
        music: { adapter: "sonos", config: {} },
        lights: { adapter: "control4", config: {} },
      },
    },
    backyard: {
      label: "Backyard",
      devices: {
        fountain: { adapter: "tuya", config: { kind: "switch" } },
      },
    },
    sauna: {
      label: "Sauna",
      devices: {
        sauna: { adapter: "tuya", config: { kind: "climate" } },
      },
    },
    theater: {
      label: "Theater",
      devices: {
        music: { adapter: "sonos", config: {} },
        av: { adapter: "control4", config: { sources: { apple_tv: 1, xfinity: 2 } } },
      },
    },
    upstairs_hvac: {
      label: "Upstairs HVAC",
      devices: { hvac_upstairs: { adapter: "control4", config: { c4_thermostat_id: 1 } } },
    },
    downstairs_hvac: {
      label: "Downstairs HVAC",
      devices: { hvac_downstairs: { adapter: "control4", config: { c4_thermostat_id: 2 } } },
    },
    master_bedroom: {
      label: "Master Bedroom",
      devices: {},
    },
  },
  zones: {},
  actors: {},
  hvac_zones: {
    upstairs: { thermostat_device: "hvac_upstairs", rooms: ["kitchen", "family_room", "master_bedroom"] },
    downstairs: { thermostat_device: "hvac_downstairs", rooms: ["theater"] },
  },
  c4: {
    scenes: {
      goodnight: 4644,
      good_morning: 4646,
    },
  },
};

const scenes: Scenes = {
  movie_night: {
    name: "Movie Night",
    description: "Theater setup",
    rooms: ["theater"],
    actions: [{ tool: "run_c4_scene", args: { name: "theater_movie" } }],
  },
};

function makeRouter(calls: ToolCall[]): Router {
  const registry = new ToolRegistry();
  const register = (name: string) => {
    registry.register({
      name,
      description: `test ${name}`,
      schema: z.record(z.string(), z.unknown()),
      inputSchema: {},
      execute: async (args) => {
        calls.push({ tool: name, args });
        return { tool: name, ok: true, message: `${name} ok`, state: args };
      },
    });
  };
  for (const name of ["set_skylight", "set_lights", "set_water_feature", "set_climate", "set_music", "set_video", "control_av", "run_scene", "run_c4_scene", "schedule_action", "cancel_schedule", "query_state"]) {
    register(name);
  }
  const planner: Planner = {
    plan: async () => {
      throw new Error("planner should not be called for fast-path voice commands");
    },
  };
  const scheduler: Scheduler = {
    schedule: async () => {},
    cancel: async () => {},
    snooze: async () => null,
    list: async () => [],
    loadPending: async () => {},
    close: async () => {},
  };
  return new Router({
    bus: {} as Bus,
    world: {} as World,
    house,
    scenes,
    scheduler,
    registry,
    planner,
  });
}

describe("Router fast-path action commands", () => {
  const cases: Array<{ text: string; expected: ToolCall }> = [
    {
      text: "close the sky light in the kitchen",
      expected: { tool: "set_skylight", args: { room: "kitchen", device: "skylight", action: "close" } },
    },
    {
      text: "open the kitchen skylights",
      expected: { tool: "set_skylight", args: { room: "kitchen", device: "skylight", action: "open" } },
    },
    {
      text: "close the kitchen skylights",
      expected: { tool: "set_skylight", args: { room: "kitchen", device: "skylight", action: "close" } },
    },
    {
      text: "turn the kitchen lights off",
      expected: { tool: "set_lights", args: { room: "kitchen", on: false } },
    },
    {
      text: "turn the kitchen lights on",
      expected: { tool: "set_lights", args: { room: "kitchen", on: true } },
    },
    {
      text: "dim the family room to 30",
      expected: { tool: "set_lights", args: { room: "family_room", brightness: 30 } },
    },
    {
      text: "turn off the backyard fountain",
      expected: { tool: "set_water_feature", args: { name: "fountain", on: false } },
    },
    {
      text: "set the sauna to 180 degrees",
      expected: { tool: "set_climate", args: { zone: "sauna", target_f: 180 } },
    },
    {
      text: "set the upstairs to 70",
      expected: { tool: "set_climate", args: { zone: "hvac_upstairs", target_f: 70 } },
    },
    {
      text: "set the downstairs to cool 72",
      expected: { tool: "set_climate", args: { zone: "hvac_downstairs", mode: "cool", target_f: 72 } },
    },
    {
      text: "turn the theater on",
      expected: { tool: "control_av", args: { room: "theater", action: "watch", source: "apple_tv" } },
    },
    {
      text: "turn off the theater",
      expected: { tool: "control_av", args: { room: "theater", action: "off" } },
    },
    {
      text: "good morning",
      expected: { tool: "run_c4_scene", args: { name: "good_morning" } },
    },
    {
      text: "goodnight",
      expected: { tool: "run_c4_scene", args: { name: "goodnight" } },
    },
    {
      text: "movie night in the theater",
      expected: { tool: "run_scene", args: { scene: "movie_night", room: "theater" } },
    },
    {
      text: "play smooth jazz in the kitchen at 20",
      expected: { tool: "set_music", args: { room: "kitchen", query: "smooth jazz", volume: 20 } },
    },
    {
      text: "pause music in the kitchen",
      expected: { tool: "set_music", args: { room: "kitchen", action: "pause" } },
    },
    {
      text: "turn off the kitchen lights in five minutes",
      expected: {
        tool: "schedule_action",
        args: {
          actions: [{ tool: "set_lights", args: { room: "kitchen", on: false } }],
          label: "turn off the kitchen lights in 5 minutes",
          in_minutes: 5,
        },
      },
    },
    {
      text: "cancel the kitchen lights schedule",
      expected: { tool: "cancel_schedule", args: { label_match: "kitchen lights" } },
    },
    {
      text: "what percentage open are the kitchen skylights",
      expected: { tool: "query_state", args: { path: "kitchen.skylight" } },
    },
    {
      text: "are the kitchen lights on",
      expected: { tool: "query_state", args: { path: "kitchen.lights" } },
    },
    {
      text: "is anything playing in the kitchen",
      expected: { tool: "query_state", args: { path: "kitchen.music" } },
    },
    {
      text: "is anything playing in the family room",
      expected: { tool: "query_state", args: { path: "family_room.music" } },
    },
    {
      text: "what's the temperature upstairs",
      expected: { tool: "query_state", args: { path: "upstairs_hvac.hvac_upstairs" } },
    },
    {
      text: "what's the temperature in the master bedroom",
      expected: { tool: "query_state", args: { path: "upstairs_hvac.hvac_upstairs" } },
    },
  ];

  for (const { text, expected } of cases) {
    it(`routes "${text}" without planner/API usage`, async () => {
      const calls: ToolCall[] = [];
      const router = makeRouter(calls);
      const result = await router.handle(text, "voice:alexa");

      assert.equal(result.route, "fast");
      assert.deepEqual(result.toolCalls, [expected]);
      assert.deepEqual(calls, [expected]);
      assert.equal(result.results[0]?.ok, true);
    });
  }
});

describe("Voice smoke fast-path contract", () => {
  const smokeVoice = readFileSync(new URL("../../scripts/smoke-voice.sh", import.meta.url), "utf8");
  const expectedFastPathTexts = [
    "is anything playing in the family room",
    "turn the kitchen lights off",
    "turn the kitchen lights on",
    "dim the family room to 30",
    "open the kitchen skylights",
    "close the kitchen skylights",
    "close the sky light in the kitchen",
    "what's the temperature in the master bedroom",
    "what's the temperature upstairs",
    "set the upstairs to 70",
    "set the downstairs to cool 72",
    "play smooth jazz in the kitchen at 20",
    "pause music in the kitchen",
    "turn the theater on",
    "turn off the theater",
    "good morning",
    "goodnight",
    "turn off the kitchen lights in five minutes",
    "cancel the kitchen lights schedule",
  ];

  it("fails live voice smoke when deterministic commands fall back to async or LLM", () => {
    assert.match(smokeVoice, /requires_fast_route\(\)/);
    assert.match(smokeVoice, /expected fast done response/);
  });

  for (const text of expectedFastPathTexts) {
    it(`keeps "${text}" in the smoke script and on the fast route`, async () => {
      assert.match(smokeVoice, new RegExp(`^${escapeRegExp(text)}$`, "m"));

      const calls: ToolCall[] = [];
      const router = makeRouter(calls);
      const result = await router.handle(text, "voice:alexa");

      assert.equal(result.route, "fast");
      assert.equal(result.toolCalls.length, 1);
    });
  }
});

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
