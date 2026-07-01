import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { MemoryScheduler, type ScheduledJob } from "../core/scheduler.js";
import { ToolRegistry, type ToolContext } from "./registry.js";
import { scheduleAction } from "./tools/schedule_action.js";
import { cancelSchedule } from "./tools/cancel_schedule.js";
import { type House } from "../core/house.js";
import { type Bus } from "../core/bus.js";
import { type World } from "../core/world.js";

const house: House = {
  timezone: "America/Los_Angeles",
  rooms: { living_room: { label: "Living Room", devices: {} } },
  zones: {},
  actors: {},
};

function ctx(registry: ToolRegistry, scheduler: MemoryScheduler): ToolContext {
  return {
    bus: {} as Bus,
    world: {} as World,
    house,
    scenes: {},
    scheduler,
    registry,
    actor: "test",
  };
}

describe("MemoryScheduler", () => {
  it("fires a scheduled job after the delay", async () => {
    const fired: string[] = [];
    const sched = new MemoryScheduler(async (job) => {
      fired.push(job.id);
    });
    const job: ScheduledJob = {
      id: "j1",
      fireAt: new Date(Date.now() + 50),
      actions: [{ tool: "noop", args: {} }],
      actor: "owner",
    };
    await sched.schedule(job);
    assert.equal(fired.length, 0);
    await sleep(120);
    assert.deepEqual(fired, ["j1"]);
    await sched.close();
  });

  it("cancels a pending job", async () => {
    const fired: string[] = [];
    const sched = new MemoryScheduler(async (job) => {
      fired.push(job.id);
    });
    await sched.schedule({
      id: "j2",
      fireAt: new Date(Date.now() + 100),
      actions: [{ tool: "noop", args: {} }],
      actor: "owner",
    });
    await sched.cancel("j2");
    await sleep(150);
    assert.equal(fired.length, 0);
    await sched.close();
  });

  it("fires immediately when fireAt is past", async () => {
    const fired: string[] = [];
    const sched = new MemoryScheduler(async (job) => {
      fired.push(job.id);
    });
    await sched.schedule({
      id: "j3",
      fireAt: new Date(Date.now() - 1000),
      actions: [{ tool: "noop", args: {} }],
      actor: "owner",
    });
    await sleep(50);
    assert.deepEqual(fired, ["j3"]);
    await sched.close();
  });
});

describe("schedule_action validation", () => {
  function makeRegistry(): ToolRegistry {
    const r = new ToolRegistry();
    r.register(scheduleAction);
    r.register(cancelSchedule);
    // Stub set_climate so action validation succeeds
    r.register({
      name: "set_climate",
      description: "stub",
      schema: { safeParse: (v: unknown) => ({ success: true, data: v }) } as never,
      inputSchema: { type: "object" },
      execute: async () => ({ tool: "set_climate", ok: true, message: "fired" }),
    });
    return r;
  }

  it("rejects invalid when", async () => {
    const r = makeRegistry();
    const sched = new MemoryScheduler(async () => {});
    const result = await r.run(
      { tool: "schedule_action", args: { when: "not a date", actions: [{ tool: "set_climate", args: {} }] } },
      ctx(r, sched),
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /invalid 'when'/);
    await sched.close();
  });

  it("rejects past when", async () => {
    const r = makeRegistry();
    const sched = new MemoryScheduler(async () => {});
    const result = await r.run(
      {
        tool: "schedule_action",
        args: {
          when: new Date(Date.now() - 10_000).toISOString(),
          actions: [{ tool: "set_climate", args: {} }],
        },
      },
      ctx(r, sched),
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /must be in the future/);
    await sched.close();
  });

  it("rejects unknown tools", async () => {
    const r = makeRegistry();
    const sched = new MemoryScheduler(async () => {});
    const result = await r.run(
      {
        tool: "schedule_action",
        args: {
          when: new Date(Date.now() + 60_000).toISOString(),
          actions: [{ tool: "bogus_tool", args: {} }],
        },
      },
      ctx(r, sched),
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /unknown tool/);
    await sched.close();
  });

  it("rejects nested schedule_action", async () => {
    const r = makeRegistry();
    const sched = new MemoryScheduler(async () => {});
    const result = await r.run(
      {
        tool: "schedule_action",
        args: {
          when: new Date(Date.now() + 60_000).toISOString(),
          actions: [{ tool: "schedule_action", args: { when: "2027-01-01", actions: [] } }],
        },
      },
      ctx(r, sched),
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /forbidden nested call/);
    await sched.close();
  });

  it("schedules a valid job", async () => {
    const r = makeRegistry();
    const fired: string[] = [];
    const sched = new MemoryScheduler(async (job) => {
      fired.push(job.actions[0]!.tool);
    });
    const result = await r.run(
      {
        tool: "schedule_action",
        args: {
          when: new Date(Date.now() + 100).toISOString(),
          actions: [{ tool: "set_climate", args: { zone: "hot_tub", target_f: 102 } }],
          label: "warm hot tub",
        },
      },
      ctx(r, sched),
    );
    assert.equal(result.ok, true);
    assert.match(result.message, /Scheduled 'warm hot tub'/);
    await sleep(150);
    assert.deepEqual(fired, ["set_climate"]);
    await sched.close();
  });

  it("cancels a pending job by label match", async () => {
    const r = makeRegistry();
    const fired: string[] = [];
    const sched = new MemoryScheduler(async (job) => {
      fired.push(job.actions[0]!.tool);
    });
    await sched.schedule({
      id: "lights-job",
      fireAt: new Date(Date.now() + 100),
      actions: [{ tool: "set_climate", args: { zone: "hot_tub", target_f: 102 } }],
      actor: "test",
      label: "turn off the kitchen lights in 5 minutes",
    });

    const result = await r.run(
      { tool: "cancel_schedule", args: { label_match: "kitchen lights" } },
      ctx(r, sched),
    );

    assert.equal(result.ok, true);
    assert.match(result.message, /Cancelled 'turn off the kitchen lights in 5 minutes'/);
    assert.deepEqual(await sched.list(), []);
    await sleep(150);
    assert.deepEqual(fired, []);
    await sched.close();
  });

  it("reports when no schedule matches cancellation", async () => {
    const r = makeRegistry();
    const sched = new MemoryScheduler(async () => {});
    const result = await r.run(
      { tool: "cancel_schedule", args: { label_match: "kitchen lights" } },
      ctx(r, sched),
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /no pending job matches 'kitchen lights'/);
    await sched.close();
  });
});
