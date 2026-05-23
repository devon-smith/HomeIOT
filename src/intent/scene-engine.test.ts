import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadScenes } from "../core/scenes.js";
import { ToolRegistry, type ToolContext } from "./registry.js";
import { runScene } from "./tools/run_scene.js";
import { type ExecutionResult, type ToolCall } from "./types.js";
import { type House } from "../core/house.js";
import { type Bus } from "../core/bus.js";
import { type World } from "../core/world.js";

function writeTemp(content: string): string {
  const p = path.join(os.tmpdir(), `scenes-${Date.now()}-${Math.random()}.yaml`);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

const baseHouse: House = {
  timezone: "America/Los_Angeles",
  rooms: {
    living_room: { label: "Living Room", devices: { music: { adapter: "sonos", config: {} } } },
    kitchen: { label: "Kitchen", devices: { music: { adapter: "sonos", config: {} } } },
    theater: { label: "Theater", devices: { lights: { adapter: "control4", config: {} } } },
  },
  zones: {},
  actors: {},
};

function stubCtx(registry: ToolRegistry, scenes: Record<string, unknown> = {}): ToolContext {
  return {
    bus: {} as Bus,
    world: {} as World,
    house: baseHouse,
    scenes: scenes as never,
    registry,
    actor: "test",
  };
}

describe("loadScenes", () => {
  it("parses a valid scenes file", () => {
    const p = writeTemp(`scenes:
  movie_night:
    name: Movie Night
    description: Theater AV on, music low
    rooms: [theater]
    actions:
      - tool: run_c4_scene
        args: { name: theater_movie }
      - tool: set_music
        args: { room: living_room, volume: 10 }
`);
    const scenes = loadScenes(p);
    assert.equal(Object.keys(scenes).length, 1);
    assert.equal(scenes["movie_night"]?.name, "Movie Night");
    assert.equal(scenes["movie_night"]?.actions.length, 2);
    fs.unlinkSync(p);
  });

  it("rejects nested run_scene calls", () => {
    const p = writeTemp(`scenes:
  bad:
    name: Nested
    actions:
      - tool: run_scene
        args: { scene: other }
`);
    assert.throws(() => loadScenes(p), /nested run_scene/);
    fs.unlinkSync(p);
  });

  it("rejects empty actions", () => {
    const p = writeTemp(`scenes:
  empty:
    name: Empty
    actions: []
`);
    assert.throws(() => loadScenes(p));
    fs.unlinkSync(p);
  });
});

describe("run_scene engine", () => {
  function makeRecordingRegistry(behaviors: Record<string, (args: Record<string, unknown>) => ExecutionResult>): {
    registry: ToolRegistry;
    calls: ToolCall[];
  } {
    const calls: ToolCall[] = [];
    const registry = new ToolRegistry();
    for (const [name, fn] of Object.entries(behaviors)) {
      registry.register({
        name,
        description: `stub ${name}`,
        // No-op schema: accept anything
        schema: { safeParse: (v: unknown) => ({ success: true, data: v }) } as never,
        inputSchema: { type: "object" },
        execute: async (args) => {
          const tc: ToolCall = { tool: name, args: args as Record<string, unknown> };
          calls.push(tc);
          return fn(args as Record<string, unknown>);
        },
      });
    }
    // run_scene itself
    registry.register(runScene as never);
    return { registry, calls };
  }

  it("fails on unknown scene", async () => {
    const { registry } = makeRecordingRegistry({});
    const ctx = stubCtx(registry, {});
    const r = await registry.run({ tool: "run_scene", args: { scene: "nonexistent" } }, ctx);
    assert.equal(r.ok, false);
    assert.match(r.message, /unknown scene/);
  });

  it("executes each step in parallel", async () => {
    const { registry, calls } = makeRecordingRegistry({
      run_c4_scene: () => ({ tool: "run_c4_scene", ok: true, message: "fired" }),
      set_music: () => ({ tool: "set_music", ok: true, message: "muted" }),
    });
    const scenes = {
      movie_night: {
        name: "Movie Night",
        rooms: ["theater"],
        actions: [
          { tool: "run_c4_scene", args: { name: "theater_movie" } },
          { tool: "set_music", args: { room: "living_room", volume: 10 } },
          { tool: "set_music", args: { room: "kitchen", volume: 10 } },
        ],
      },
    };
    const ctx = stubCtx(registry, scenes);
    const r = await registry.run({ tool: "run_scene", args: { scene: "movie_night" } }, ctx);
    assert.equal(r.ok, true);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map((c) => c.tool).sort(), ["run_c4_scene", "set_music", "set_music"]);
    assert.match(r.message, /Movie Night/);
  });

  it("rejects when room mismatch", async () => {
    const { registry, calls } = makeRecordingRegistry({
      run_c4_scene: () => ({ tool: "run_c4_scene", ok: true, message: "fired" }),
    });
    const scenes = {
      movie_night: {
        name: "Movie Night",
        rooms: ["theater"],
        actions: [{ tool: "run_c4_scene", args: { name: "theater_movie" } }],
      },
    };
    const ctx = stubCtx(registry, scenes);
    const r = await registry.run({ tool: "run_scene", args: { scene: "movie_night", room: "kitchen" } }, ctx);
    assert.equal(r.ok, false);
    assert.match(r.message, /scoped to/);
    assert.equal(calls.length, 0);
  });

  it("reports partial failure with step results", async () => {
    const { registry } = makeRecordingRegistry({
      run_c4_scene: () => ({ tool: "run_c4_scene", ok: true, message: "fired" }),
      set_music: () => ({ tool: "set_music", ok: false, message: "no sonos" }),
    });
    const scenes = {
      mixed: {
        name: "Mixed",
        rooms: [],
        actions: [
          { tool: "run_c4_scene", args: { name: "theater_movie" } },
          { tool: "set_music", args: { room: "living_room", volume: 10 } },
        ],
      },
    };
    const ctx = stubCtx(registry, scenes);
    const r = await registry.run({ tool: "run_scene", args: { scene: "mixed" } }, ctx);
    assert.equal(r.ok, false);
    assert.match(r.message, /1\/2 failed/);
    assert.match(r.message, /set_music/);
  });
});
