import crypto from "node:crypto";
import { type FastifyReply, type FastifyRequest } from "fastify";
import { config } from "../config.js";
import { log } from "../core/log.js";

/**
 * HMAC-SHA256 over the canonical string `${ts}.${requestId}.${text}`.
 *
 * We sign the canonical string rather than the raw JSON body so the
 * signature is stable across any JSON-serialization quirks (key order,
 * whitespace, etc.) on either side. Both the Alexa Lambda and the
 * Brain compute and compare exactly the same bytes.
 *
 * The signing inputs come from request headers + body:
 *   X-HB-Timestamp:  ms epoch (Number-coercible)
 *   X-HB-Signature:  lowercase hex sha256(ts.requestId.text)
 *
 * Body must contain `requestId` (UUID-ish, stable across Alexa retries
 * so we can dedupe) and `text` (the spoken/typed command).
 */

const SIG_ALGO = "sha256";

export function sign(secret: string, ts: string | number, requestId: string, text: string): string {
  return crypto
    .createHmac(SIG_ALGO, secret)
    .update(`${ts}.${requestId}.${text}`)
    .digest("hex");
}

export interface VoiceBody {
  text?: string;
  source?: string;
  requestId?: string;
  sessionId?: string;
  userId?: string;
  deadlineMs?: number;
}

/**
 * Fastify preHandler. Rejects the request with 401 if the signature is
 * missing, malformed, expired, or wrong. Sets `req.hmacVerified = true`
 * on success so downstream handlers know they're authenticated.
 *
 * If HB_HMAC_SECRET is not set in env, every /interpret request is
 * rejected with 503 (the endpoint is effectively disabled).
 */
export function verifyHmac(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
): void {
  if (!config.HB_HMAC_SECRET) {
    reply.code(503).send({ error: "voice endpoint disabled (HB_HMAC_SECRET unset)" });
    return;
  }

  const tsRaw = req.headers["x-hb-timestamp"];
  const sigRaw = req.headers["x-hb-signature"];
  const body = (req.body ?? {}) as VoiceBody;
  const { requestId, text } = body;

  if (typeof tsRaw !== "string" || typeof sigRaw !== "string" || !requestId || !text) {
    reply.code(401).send({ error: "unsigned" });
    return;
  }

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > config.HB_HMAC_MAX_SKEW_MS) {
    reply.code(401).send({ error: "stale or bad timestamp" });
    return;
  }

  const expected = sign(config.HB_HMAC_SECRET, tsRaw, requestId, text);
  const sigBuf = Buffer.from(sigRaw, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    log.warn({ requestId }, "hmac verify failed");
    reply.code(401).send({ error: "bad signature" });
    return;
  }

  (req as FastifyRequest & { hmacVerified?: boolean }).hmacVerified = true;
  done();
}
