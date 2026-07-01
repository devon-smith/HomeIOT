import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleVoiceInterpret } from "./interpret.js";
import { type IntentResult } from "../intent/types.js";

describe("handleVoiceInterpret", () => {
  it("returns fast action evidence for the reported Alexa skylight command", async () => {
    const events: Array<{ kind: string; payload: unknown }> = [];
    const usage: Array<{ result: IntentResult; text: string; actor: string }> = [];
    const calls: Array<{ text: string; actor: string }> = [];

    const response = await handleVoiceInterpret(
      {
        text: "close the sky light in the kitchen",
        source: "alexa",
        requestId: "req-skylight",
      },
      {
        router: {
          handle: async (text, actor) => {
            calls.push({ text, actor });
            return {
              route: "fast",
              toolCalls: [{ tool: "set_skylight", args: { room: "kitchen", device: "skylight", action: "close" } }],
              results: [{ tool: "set_skylight", ok: true, message: "Closed the kitchen skylight." }],
              response: "Closed the kitchen skylight.",
              latencyMs: 7,
            };
          },
        },
        reserveRequest: async (requestId, ttlMs) => {
          assert.equal(requestId, "req-skylight");
          assert.equal(ttlMs, 60_000);
          return true;
        },
        trackUsage: (result, text, actor) => usage.push({ result, text, actor }),
        pushEvent: (kind, payload) => events.push({ kind, payload }),
        voiceDeadlineMs: 6500,
        voiceTerse: true,
        voiceKeepOpen: true,
      },
    );

    assert.deepEqual(calls, [{ text: "close the sky light in the kitchen", actor: "voice:alexa" }]);
    assert.equal(response.status, "done");
    assert.equal(response.spoken, "Closed the kitchen skylight.");
    assert.equal(response.keepSessionOpen, true);
    assert.equal(response.route, "fast");
    assert.deepEqual(response.toolCalls, [
      { tool: "set_skylight", args: { room: "kitchen", device: "skylight", action: "close" } },
    ]);
    assert.equal(usage.length, 1);
    assert.equal(usage[0]?.actor, "voice:alexa");
    assert.equal(events[0]?.kind, "voice_done");
    assert.match(JSON.stringify(events[0]?.payload), /"route":"fast"/);
  });

  it("does not report a status query as success for action wording", async () => {
    const response = await handleVoiceInterpret(
      {
        text: "close the sky light in the kitchen",
        source: "alexa",
        requestId: "req-missed-action",
      },
      {
        router: {
          handle: async () => ({
            route: "llm",
            toolCalls: [{ tool: "query_state", args: { path: "kitchen.skylight" } }],
            results: [{ tool: "query_state", ok: true, message: "The kitchen skylight is 73% open." }],
            response: "The kitchen skylight is 73% open.",
            latencyMs: 10,
          }),
        },
        reserveRequest: async () => true,
        trackUsage: () => {},
        pushEvent: () => {},
        voiceDeadlineMs: 6500,
        voiceTerse: true,
        voiceKeepOpen: true,
      },
    );

    assert.equal(response.status, "error");
    assert.equal(response.spoken, "I didn't run that command.");
    assert.equal("missedAction" in response ? response.missedAction : false, true);
  });
});
