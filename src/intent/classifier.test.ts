import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify } from "./classifier.js";
import { normalize } from "./normalize.js";
import { type House } from "../core/house.js";
import { type Scenes } from "../core/scenes.js";

const house: House = {
  timezone: "America/Los_Angeles",
  rooms: {
    living_room: {
      label: "Living Room",
      devices: {
        music: { adapter: "sonos", config: {} },
        lights: { adapter: "control4", config: {} },
      },
    },
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
        hot_tub: { adapter: "iaqualink", config: { system: "spa" } },
        pool: { adapter: "iaqualink", config: { system: "pool" } },
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
        av: {
          adapter: "control4",
          config: {
            sources: {
              apple_tv: 1,
              xfinity: 2,
            },
          },
        },
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
    master_bath: {
      label: "Master Bath",
      devices: { skylight: { adapter: "control4", config: {} } },
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

function run(text: string) {
  return classify(normalize(text), house, scenes);
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

describe("classifier — play music", () => {
  it("matches room-scoped play queries", () => {
    const r = run("play jazz rock in the living room");
    assert.equal(r?.patternName, "play_music_query");
    assert.deepEqual(r?.toolCall, {
      tool: "set_music",
      args: { room: "living_room", query: "jazz rock" },
    });
  });
  it("matches play queries with volume", () => {
    const r = run("play dinner jazz in the kitchen at volume 30");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", query: "dinner jazz", volume: 30 });
  });
  it("rejects rooms without music", () => {
    assert.equal(run("play jazz in the backyard"), null);
  });
});

describe("classifier — scheduling", () => {
  it("matches relative scheduled actions", () => {
    const r = run("turn off the kitchen lights in five minutes");
    assert.equal(r?.patternName, "schedule_relative_action");
    assert.deepEqual(r?.toolCall, {
      tool: "schedule_action",
      args: {
        actions: [{ tool: "set_lights", args: { room: "kitchen", on: false } }],
        label: "turn off the kitchen lights in 5 minutes",
        in_minutes: 5,
      },
    });
  });

  it("matches relative hour wording", () => {
    const r = run("turn the kitchen lights on in 2 hours");
    assert.deepEqual(r?.toolCall.args, {
      actions: [{ tool: "set_lights", args: { room: "kitchen", on: true } }],
      label: "turn the kitchen lights on in 2 hours",
      in_hours: 2,
    });
  });

  it("rejects scheduling commands when the inner action is not deterministic", () => {
    assert.equal(run("make the house cozy in five minutes"), null);
  });

  it("matches schedule cancellation by label", () => {
    const r = run("cancel the kitchen lights schedule");
    assert.equal(r?.patternName, "cancel_schedule");
    assert.deepEqual(r?.toolCall, {
      tool: "cancel_schedule",
      args: { label_match: "kitchen lights" },
    });
  });

  it("matches broad schedule cancellation", () => {
    const r = run("cancel schedule");
    assert.deepEqual(r?.toolCall, {
      tool: "cancel_schedule",
      args: {},
    });
  });
});

describe("classifier — status queries", () => {
  it("matches skylight percentage questions", () => {
    const r = run("what percentage open are the kitchen skylights");
    assert.equal(r?.patternName, "query_skylight_room_first");
    assert.deepEqual(r?.toolCall, {
      tool: "query_state",
      args: { path: "kitchen.skylight" },
    });
  });

  it("matches device-first skylight questions", () => {
    const r = run("how open is the sky light in the kitchen");
    assert.equal(r?.patternName, "query_skylight_device_first");
    assert.deepEqual(r?.toolCall.args, { path: "kitchen.skylight" });
  });

  it("matches room light state questions", () => {
    const r = run("are the kitchen lights on");
    assert.equal(r?.patternName, "query_lights_state");
    assert.deepEqual(r?.toolCall.args, { path: "kitchen.lights" });
  });

  it("matches room music state questions", () => {
    const r = run("is anything playing in the kitchen");
    assert.equal(r?.patternName, "query_music_playing");
    assert.deepEqual(r?.toolCall.args, { path: "kitchen.music" });
  });

  it("matches HVAC zone temperature questions", () => {
    const r = run("what's the temperature upstairs");
    assert.equal(r?.patternName, "query_climate_temperature");
    assert.deepEqual(r?.toolCall.args, { path: "upstairs_hvac.hvac_upstairs" });
  });

  it("matches room-to-HVAC-zone temperature questions", () => {
    const r = run("what's the temperature in the master bedroom");
    assert.equal(r?.patternName, "query_climate_temperature");
    assert.deepEqual(r?.toolCall.args, { path: "upstairs_hvac.hvac_upstairs" });
  });
});

describe("classifier — lights", () => {
  it("matches room-first on/off wording", () => {
    const r = run("turn off the kitchen lights");
    assert.equal(r?.patternName, "lights_action_room_first");
    assert.deepEqual(r?.toolCall, {
      tool: "set_lights",
      args: { room: "kitchen", on: false },
    });
  });
  it("matches device-first on/off wording", () => {
    const r = run("switch lights in the living room on");
    assert.equal(r?.patternName, "lights_action_device_first");
    assert.deepEqual(r?.toolCall.args, { room: "living_room", on: true });
  });
  it("matches Alexa-style state-at-end wording", () => {
    const r = run("turn the kitchen lights off");
    assert.equal(r?.patternName, "lights_action_state_last");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", on: false });
  });
  it("matches room-first brightness wording", () => {
    const r = run("dim the kitchen lights to 30%");
    assert.equal(r?.patternName, "lights_brightness_room_first");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", brightness: 30 });
  });
  it("matches brightness wording without repeating lights", () => {
    const r = run("dim the family room to 30");
    assert.equal(r?.patternName, "lights_brightness_room_only");
    assert.deepEqual(r?.toolCall.args, { room: "family_room", brightness: 30 });
  });
  it("matches device-first brightness wording", () => {
    const r = run("set the lights in the living room to 40");
    assert.equal(r?.patternName, "lights_brightness_device_first");
    assert.deepEqual(r?.toolCall.args, { room: "living_room", brightness: 40 });
  });
  it("clamps brightness to 100", () => {
    const r = run("set kitchen lights to 250");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", brightness: 100 });
  });
  it("rejects rooms without lights", () => {
    assert.equal(run("turn off the master bath lights"), null);
  });
});

describe("classifier — skylights", () => {
  it("matches room-first close wording", () => {
    const r = run("close the kitchen skylight");
    assert.equal(r?.patternName, "skylight_action_room_first");
    assert.deepEqual(r?.toolCall, {
      tool: "set_skylight",
      args: { room: "kitchen", device: "skylight", action: "close" },
    });
  });
  it("matches device-first close wording", () => {
    const r = run("close the skylight in the kitchen");
    assert.equal(r?.patternName, "skylight_action_device_first");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", action: "close" });
  });
  it("matches the reported Alexa sky light command", () => {
    const r = run("close the sky light in the kitchen");
    assert.equal(r?.patternName, "skylight_action_device_first");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", action: "close" });
  });
  it("matches split sky light wording", () => {
    const r = run("open the kitchen sky light");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", action: "open" });
  });
  it("matches skylight window wording", () => {
    const r = run("close the kitchen skylight windows");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", action: "close" });
  });
  it("maps shut to close for skylights", () => {
    const r = run("shut the sky light in the kitchen");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", action: "close" });
  });
  it("matches label-style room names", () => {
    const r = run("close the master bath skylight");
    assert.deepEqual(r?.toolCall.args, { room: "master_bath", device: "skylight", action: "close" });
  });
  it("matches percentage positions", () => {
    const r = run("set the kitchen skylight to 40%");
    assert.equal(r?.patternName, "skylight_position_room_first");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", position: 40 });
  });
  it("clamps skylight position to 100", () => {
    const r = run("set the skylight in the kitchen to 250");
    assert.deepEqual(r?.toolCall.args, { room: "kitchen", device: "skylight", position: 100 });
  });
  it("rejects rooms without skylight devices", () => {
    assert.equal(run("close the theater skylight"), null);
  });
});

describe("classifier — climate", () => {
  it("matches hot tub target commands", () => {
    const r = run("warm the hot tub to 102");
    assert.equal(r?.patternName, "climate_target");
    assert.deepEqual(r?.toolCall, {
      tool: "set_climate",
      args: { zone: "hot_tub", target_f: 102 },
    });
  });
  it("matches sauna target commands", () => {
    const r = run("set the sauna to 180 degrees");
    assert.deepEqual(r?.toolCall.args, { zone: "sauna", target_f: 180 });
  });
  it("matches HVAC zone target commands", () => {
    const r = run("set the upstairs to 70");
    assert.deepEqual(r?.toolCall.args, { zone: "hvac_upstairs", target_f: 70 });
  });
  it("matches HVAC mode and target commands", () => {
    const r = run("set the downstairs to cool 72");
    assert.equal(r?.patternName, "climate_mode_target");
    assert.deepEqual(r?.toolCall.args, { zone: "hvac_downstairs", mode: "cool", target_f: 72 });
  });
  it("matches climate off commands", () => {
    const r = run("turn off the hot tub");
    assert.equal(r?.patternName, "climate_off");
    assert.deepEqual(r?.toolCall.args, { zone: "hot_tub", mode: "off" });
  });
  it("matches pool heater off wording", () => {
    const r = run("turn off the pool heater");
    assert.equal(r?.patternName, "climate_off");
    assert.deepEqual(r?.toolCall.args, { zone: "pool", mode: "off" });
  });
  it("matches HVAC air-conditioning off wording", () => {
    const r = run("turn off the upstairs air conditioning");
    assert.equal(r?.patternName, "climate_off");
    assert.deepEqual(r?.toolCall.args, { zone: "hvac_upstairs", mode: "off" });
  });
  it("does not treat non-climate switches as climate", () => {
    const r = run("turn off the fountain");
    assert.equal(r?.toolCall.tool, "set_water_feature");
  });
});

describe("classifier — water features", () => {
  it("matches simple fountain on/off commands", () => {
    const r = run("turn on the fountain");
    assert.equal(r?.patternName, "water_feature_action");
    assert.deepEqual(r?.toolCall, {
      tool: "set_water_feature",
      args: { name: "fountain", on: true },
    });
  });
  it("matches room-qualified fountain commands", () => {
    const r = run("turn off the backyard fountain");
    assert.deepEqual(r?.toolCall.args, { name: "fountain", on: false });
  });
});

describe("classifier — AV and scenes", () => {
  it("matches theater power using a default AV source", () => {
    const r = run("turn the theater on");
    assert.equal(r?.patternName, "video_power_state_last");
    assert.deepEqual(r?.toolCall, {
      tool: "control_av",
      args: { room: "theater", action: "watch", source: "apple_tv" },
    });
  });

  it("matches theater off commands", () => {
    const r = run("turn off the theater");
    assert.equal(r?.patternName, "video_power_action");
    assert.deepEqual(r?.toolCall, {
      tool: "control_av",
      args: { room: "theater", action: "off" },
    });
  });

  it("matches explicit watch-source commands", () => {
    const r = run("watch xfinity in the theater");
    assert.equal(r?.patternName, "watch_source");
    assert.deepEqual(r?.toolCall.args, { room: "theater", action: "watch", source: "xfinity" });
  });

  it("matches brain-owned scene names", () => {
    const r = run("movie night in the theater");
    assert.equal(r?.patternName, "run_known_scene");
    assert.deepEqual(r?.toolCall, {
      tool: "run_scene",
      args: { scene: "movie_night", room: "theater" },
    });
  });

  it("matches C4 scene names", () => {
    const r = run("good morning");
    assert.equal(r?.patternName, "run_known_scene");
    assert.deepEqual(r?.toolCall, {
      tool: "run_c4_scene",
      args: { name: "good_morning" },
    });
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
