import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./classifier.js";
import { normalize } from "./normalize.js";
import { type House } from "../core/house.js";

const house: House = {
  timezone: "America/Los_Angeles",
  rooms: {
    living_room: { label: "Living Room", devices: { music: { adapter: "sonos", config: {} } } },
    kitchen: { label: "Kitchen", devices: { music: { adapter: "sonos", config: {} } } },
    theater: { label: "Theater", devices: { music: { adapter: "sonos", config: {} } } },
  },
  zones: {},
  actors: {},
};

function run(text: string) {
  return classify(normalize(text), house);
}

describe("classifier — pause", () => {
  it("matches 'pause music in the living room'", () => {
    const r = run("pause music in the living room");
    assert.equal(r?.toolCall.tool, "set_music");
    assert.deepEqual(r?.toolCall.args, { room: "living_room", action: "pause" });
  });
  it("matches 'stop the music in kitchen'", () => {
    const r = run("stop the music in kitchen");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", action: "pause" });
  });
  it("matches just 'pause in the theater'", () => {
    const r = run("pause in the theater");
    assert.deepEqual(r?.toolCall.args, { room: "theater", action: "pause" });
  });
  it("rejects pause without a resolvable room", () => {
    assert.equal(run("pause music"), null);
    assert.equal(run("pause in bathroom"), null);
  });
});

describe("classifier — next/previous", () => {
  it("matches 'next song in the living room'", () => {
    const r = run("next song in the living room");
    assert.deepEqual(r?.toolCall.args, { room: "living_room", action: "next" });
  });
  it("matches 'skip in kitchen'", () => {
    const r = run("skip in kitchen");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", action: "next" });
  });
  it("matches 'previous track in the theater'", () => {
    const r = run("previous track in the theater");
    assert.deepEqual(r?.toolCall.args, { room: "theater", action: "previous" });
  });
});

describe("classifier — volume", () => {
  it("matches 'volume 25 in the kitchen'", () => {
    const r = run("volume 25 in the kitchen");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", volume: 25 });
  });
  it("matches 'set the volume to 50% in the living room'", () => {
    const r = run("set the volume to 50% in the living room");
    assert.deepEqual(r?.toolCall.args, { room: "living_room", volume: 50 });
  });
  it("clamps volume to 100", () => {
    const r = run("volume 250 in theater");
    assert.deepEqual(r?.toolCall.args, { room: "theater", volume: 100 });
  });
});

describe("classifier — resume", () => {
  it("matches 'resume music in the kitchen'", () => {
    const r = run("resume music in the kitchen");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", action: "resume" });
  });
});

describe("classifier — non-matches", () => {
  it("returns null for free-form requests", () => {
    assert.equal(run("play jazz rock in the living room"), null);
    assert.equal(run("warm the hot tub for 9pm"), null);
    assert.equal(run("what is happening"), null);
  });
});

describe("normalize", () => {
  it("lowercases, trims, collapses whitespace", () => {
    assert.equal(normalize("  Pause   Music  "), "pause music");
  });
  it("strips trailing punctuation", () => {
    assert.equal(normalize("pause music."), "pause music");
    assert.equal(normalize("what's playing?"), "what's playing");
  });
  it("normalizes smart quotes", () => {
    assert.equal(normalize("what’s playing"), "what's playing");
  });
});
