import { authorizeForSource, type Source } from "../auth/source-authz.js";
import { type IntentResult } from "../intent/types.js";
import { buildVoiceResponse, type VoiceResponse } from "./response.js";

export interface VoiceInterpretBody {
  text?: string;
  source?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  deadlineMs?: number;
}

export type VoiceInterpretResponse = VoiceResponse | {
  spoken: string;
  status: "async" | "duplicate" | "error";
  keepSessionOpen?: boolean;
  reprompt?: string | null;
};

export interface VoiceInterpretDeps {
  router: {
    handle(text: string, actor: string): Promise<IntentResult>;
  };
  reserveRequest(requestId: string, ttlMs: number): Promise<boolean>;
  trackUsage(result: IntentResult, text: string, actor: string): void;
  pushEvent(kind: string, payload: unknown): void;
  logAsync?(requestId: string, result: IntentResult): void;
  logAsyncError?(requestId: string, err: Error): void;
  voiceDeadlineMs: number;
  voiceTerse: boolean;
  voiceKeepOpen: boolean;
  hardTimeoutMs?: number;
  dedupeTtlMs?: number;
}

const SLOW = Symbol("slow");
const DEFAULT_HARD_TIMEOUT_MS = 30_000;
const DEFAULT_DEDUPE_TTL_MS = 60_000;

export async function handleVoiceInterpret(
  body: VoiceInterpretBody | undefined,
  deps: VoiceInterpretDeps,
): Promise<VoiceInterpretResponse> {
  if (!body?.text || !body.requestId) {
    return { spoken: "Sorry, that came through garbled.", status: "error" };
  }

  const source = parseVoiceSource(body.source);
  const hardTimeoutMs = deps.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
  const deadlineMs = Math.min(
    Math.max(500, body.deadlineMs ?? deps.voiceDeadlineMs),
    hardTimeoutMs,
  );

  const fresh = await deps.reserveRequest(body.requestId, deps.dedupeTtlMs ?? DEFAULT_DEDUPE_TTL_MS);
  if (!fresh) {
    return { spoken: "Already on it.", status: "duplicate" };
  }

  const guard = authorizeForSource(body.text, source);
  if (guard.decision === "block") {
    deps.pushEvent("voice_blocked", {
      source,
      requestId: body.requestId,
      text: body.text,
      reason: guard.message,
    });
    return { spoken: guard.message ?? "That isn't allowed by voice.", status: "error" };
  }

  const actor = `voice:${source}`;
  const exec = deps.router.handle(body.text, actor);
  const timer = new Promise<typeof SLOW>((resolve) => setTimeout(() => resolve(SLOW), deadlineMs));
  const winner = await Promise.race([exec, timer]);

  if (winner === SLOW) {
    exec.then(
      (r) => {
        deps.trackUsage(r, body.text!, actor);
        deps.logAsync?.(body.requestId!, r);
      },
      (err) => deps.logAsyncError?.(body.requestId!, err as Error),
    );
    deps.pushEvent("voice_async", { source, requestId: body.requestId, text: body.text });
    return { spoken: ackForText(body.text), status: "async" };
  }

  const result = winner;
  deps.trackUsage(result, body.text, actor);
  const voiceResponse = buildVoiceResponse({
    source,
    text: body.text,
    result,
    terse: deps.voiceTerse,
    keepOpen: deps.voiceKeepOpen,
  });

  deps.pushEvent("voice_done", {
    source,
    requestId: body.requestId,
    text: body.text,
    route: result.route,
    latencyMs: result.latencyMs,
    ok: voiceResponse.status === "done",
    ...(voiceResponse.missedAction ? { missedAction: true } : {}),
    ...(!voiceResponse.missedAction
      ? {
          terse: deps.voiceTerse && voiceResponse.status === "done" && result.toolCalls.length > 0,
          keepOpen: voiceResponse.keepSessionOpen,
        }
      : {}),
  });

  return voiceResponse;
}

export function ackForText(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("movie night")) return "Setting up movie night.";
  if (t.includes("goodnight") || t.includes("good night")) return "Saying goodnight.";
  if (t.includes("good morning")) return "Starting the morning.";
  if (t.includes("warm") && t.includes("hot tub")) return "Warming the hot tub.";
  return "On it.";
}

function parseVoiceSource(input: string | undefined): Source {
  if (input === "web" || input === "alexa" || input === "siri" || input === "imessage" || input === "api") {
    return input;
  }
  return "alexa";
}
