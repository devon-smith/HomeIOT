import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  authorizeToolForSource,
  isActionTool,
  isLikelyActionRequest,
  isMissedVoiceAction,
  sourceFromActor,
} from "./source-authz.js";

describe("isLikelyActionRequest", () => {
  it("detects imperative home-control commands", () => {
    assert.equal(isLikelyActionRequest("close the kitchen skylight"), true);
    assert.equal(isLikelyActionRequest("close the sky light in the kitchen"), true);
    assert.equal(isLikelyActionRequest("turn off the landscape lights"), true);
    assert.equal(isLikelyActionRequest("turn the kitchen lights off"), true);
    assert.equal(isLikelyActionRequest("dim the family room to 30"), true);
    assert.equal(isLikelyActionRequest("warm the hot tub to 102"), true);
    assert.equal(isLikelyActionRequest("play dinner jazz"), true);
  });

  it("does not treat status questions as action requests", () => {
    assert.equal(isLikelyActionRequest("what percentage open are the kitchen skylights"), false);
    assert.equal(isLikelyActionRequest("are the landscape lights on"), false);
    assert.equal(isLikelyActionRequest("what is the hot tub status"), false);
  });
});

describe("isActionTool", () => {
  it("treats query_state as non-action and mutating tools as actions", () => {
    assert.equal(isActionTool("query_state"), false);
    assert.equal(isActionTool("set_skylight"), true);
    assert.equal(isActionTool("set_lights"), true);
  });
});

describe("tool source policy", () => {
  it("maps voice actors to their source", () => {
    assert.equal(sourceFromActor("voice:alexa"), "alexa");
    assert.equal(sourceFromActor("voice:siri"), "siri");
    assert.equal(sourceFromActor("owner"), "api");
  });

  it("blocks dangerous future tools from voice", () => {
    assert.equal(authorizeToolForSource("unlock_door", "alexa").decision, "block");
    assert.equal(authorizeToolForSource("set_lights", "alexa").decision, "allow");
  });
});

describe("isMissedVoiceAction", () => {
  it("flags Alexa action commands that only queried state", () => {
    assert.equal(isMissedVoiceAction("alexa", "close the kitchen skylight", ["query_state"]), true);
    assert.equal(isMissedVoiceAction("siri", "turn off the fountain", []), true);
  });

  it("does not flag successful action-tool routing", () => {
    assert.equal(isMissedVoiceAction("alexa", "close the kitchen skylight", ["set_skylight"]), false);
    assert.equal(isMissedVoiceAction("alexa", "close the sky light in the kitchen", ["set_skylight"]), false);
    assert.equal(isMissedVoiceAction("alexa", "turn off kitchen lights", ["query_state", "set_lights"]), false);
  });

  it("does not flag status questions or non-voice sources", () => {
    assert.equal(isMissedVoiceAction("alexa", "what percentage open are the kitchen skylights", ["query_state"]), false);
    assert.equal(isMissedVoiceAction("web", "close the kitchen skylight", ["query_state"]), false);
  });
});
