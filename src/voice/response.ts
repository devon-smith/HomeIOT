import { isMissedVoiceAction, type Source } from "../auth/source-authz.js";
import { type IntentResult, type ToolCall } from "../intent/types.js";

export interface VoiceResponse {
  spoken: string;
  status: "done" | "error";
  keepSessionOpen: boolean;
  reprompt: string | null;
  route: IntentResult["route"];
  latencyMs: number;
  toolCalls: ToolCall[];
  missedAction?: true;
}

export interface VoiceResponseOptions {
  source: Source;
  text: string;
  result: IntentResult;
  terse: boolean;
  keepOpen: boolean;
}

export function buildVoiceResponse(options: VoiceResponseOptions): VoiceResponse {
  const { source, text, result } = options;
  const missedAction = isMissedVoiceAction(source, text, result.toolCalls.map((tc) => tc.tool));
  if (missedAction) {
    return {
      spoken: "I didn't run that command.",
      status: "error",
      keepSessionOpen: false,
      reprompt: null,
      route: result.route,
      latencyMs: result.latencyMs,
      toolCalls: result.toolCalls,
      missedAction: true,
    };
  }

  const ok = result.results.every((r) => r.ok) || result.results.length === 0;
  const isAction = result.toolCalls.length > 0;
  const spoken = options.terse && ok && isAction
    ? terseFor(result.response)
    : ttsFriendly(result.response);
  const keepSessionOpen = options.keepOpen && ok && source === "alexa";

  return {
    spoken,
    status: ok ? "done" : "error",
    keepSessionOpen,
    reprompt: keepSessionOpen ? "What else?" : null,
    route: result.route,
    latencyMs: result.latencyMs,
    toolCalls: result.toolCalls,
  };
}

// Collapse planner prose down to a single short clause Alexa can speak in under
// a second. Falls back to "OK." on anything empty or unusual.
export function terseFor(s: string): string {
  const out = ttsFriendly(s);
  if (!out) return "OK.";
  const m = out.match(/^[^.!?]{1,80}[.!?]/);
  if (m) return m[0];
  if (out.length <= 80) return out.endsWith(".") ? out : out + ".";
  return out.slice(0, 77).trim() + "...";
}

export function ttsFriendly(s: string): string {
  let out = (s || "").trim();
  out = out
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (out.length > 240) out = out.slice(0, 237).trim() + "...";
  return out || "Done.";
}
