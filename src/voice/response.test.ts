import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildVoiceResponse, terseFor, ttsFriendly } from "./response.js";
import { type IntentResult } from "../intent/types.js";

function result(partial: Partial<IntentResult>): IntentResult {
  return {
    route: "llm",
    toolCalls: [],
    results: [],
    response: "Done.",
    latencyMs: 12,
    ...partial,
  };
}

describe("buildVoiceResponse", () => {
  it("returns an explicit error when Alexa action wording only queried state", () => {
    const response = buildVoiceResponse({
      source: "alexa",
      text: "close the sky light in the kitchen",
      terse: true,
      keepOpen: true,
      result: result({
        toolCalls: [{ tool: "query_state", args: { path: "kitchen.skylight" } }],
        results: [{ tool: "query_state", ok: true, message: "state for kitchen.skylight" }],
        response: "The kitchen skylight is 73 percent open.",
      }),
    });

    assert.deepEqual(response, {
      spoken: "I didn't run that command.",
      status: "error",
      keepSessionOpen: false,
      reprompt: null,
      route: "llm",
      latencyMs: 12,
      toolCalls: [{ tool: "query_state", args: { path: "kitchen.skylight" } }],
      missedAction: true,
    });
  });

  it("keeps successful Alexa action responses short and session-open", () => {
    const response = buildVoiceResponse({
      source: "alexa",
      text: "turn the kitchen lights off",
      terse: true,
      keepOpen: true,
      result: result({
        route: "fast",
        toolCalls: [{ tool: "set_lights", args: { room: "kitchen", on: false } }],
        results: [{ tool: "set_lights", ok: true, message: "Turned off the kitchen lights." }],
        response: "Turned off the kitchen lights. The kitchen is now dark.",
      }),
    });

    assert.equal(response.status, "done");
    assert.equal(response.spoken, "Turned off the kitchen lights.");
    assert.equal(response.keepSessionOpen, true);
    assert.equal(response.reprompt, "What else?");
    assert.equal(response.missedAction, undefined);
  });

  it("allows status queries to return query_state answers", () => {
    const response = buildVoiceResponse({
      source: "alexa",
      text: "what percentage open are the kitchen skylights",
      terse: true,
      keepOpen: true,
      result: result({
        toolCalls: [{ tool: "query_state", args: { path: "kitchen.skylight" } }],
        results: [{ tool: "query_state", ok: true, message: "state for kitchen.skylight" }],
        response: "The kitchen skylight is 73 percent open.",
      }),
    });

    assert.equal(response.status, "done");
    assert.equal(response.spoken, "The kitchen skylight is 73 percent open.");
    assert.equal(response.keepSessionOpen, true);
    assert.equal(response.missedAction, undefined);
  });
});

describe("voice TTS formatting", () => {
  it("strips markdown that Alexa would read literally", () => {
    assert.equal(ttsFriendly("**Kitchen** is `off`\n- all good"), "Kitchen is off. all good");
  });

  it("uses the first short sentence for terse action confirmations", () => {
    assert.equal(terseFor("Turned off the kitchen lights. The kitchen is now dark."), "Turned off the kitchen lights.");
  });
});
