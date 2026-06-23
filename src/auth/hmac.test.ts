import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Stub the config module BEFORE importing the SUT so it picks up our secret.
process.env.HB_HMAC_SECRET = "test-secret-do-not-use-in-prod-0123456789abcdef";
process.env.HB_HMAC_MAX_SKEW_MS = "5000";

const { sign, verifyHmac } = await import("./hmac.js");

const SECRET = process.env.HB_HMAC_SECRET!;

function makeReq(headers: Record<string, string>, body: unknown): any {
  return { headers, body };
}
function makeReply(): { code: number; payload: unknown; sent: boolean; codeFn: (n: number) => any; send: (p: unknown) => void } {
  const r: any = { code: 200, payload: null, sent: false };
  r.codeFn = (n: number) => { r.code = n; return r; };
  r.code = r.codeFn;  // fastify-style chainable
  r.send = (p: unknown) => { r.payload = p; r.sent = true; };
  return r;
}
function call(req: any, reply: any): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };
    verifyHmac(req, reply, done);
    // The middleware short-circuits (sends reply without calling done)
    // when auth fails. Resolve on the next tick if it did.
    setImmediate(() => { if (reply.sent && !settled) done(); });
  });
}

describe("hmac sign()", () => {
  it("matches a hand-computed sha256", () => {
    const expected = crypto.createHmac("sha256", SECRET).update("1234.req-1.hello").digest("hex");
    assert.equal(sign(SECRET, "1234", "req-1", "hello"), expected);
  });

  it("produces 64 lowercase hex chars", () => {
    const s = sign(SECRET, Date.now().toString(), "abc", "play jazz");
    assert.match(s, /^[0-9a-f]{64}$/);
  });

  it("differs when any input changes", () => {
    const a = sign(SECRET, "1000", "rid", "lights on");
    const b = sign(SECRET, "1001", "rid", "lights on");
    const c = sign(SECRET, "1000", "RID", "lights on");
    const d = sign(SECRET, "1000", "rid", "lights off");
    assert.notEqual(a, b);
    assert.notEqual(a, c);
    assert.notEqual(a, d);
  });
});

describe("verifyHmac middleware", () => {
  it("accepts a freshly-signed request", async () => {
    const ts = Date.now().toString();
    const body = { text: "turn off the kitchen lights", requestId: "rid-ok" };
    const sig = sign(SECRET, ts, body.requestId, body.text);
    const req = makeReq({ "x-hb-timestamp": ts, "x-hb-signature": sig }, body);
    const reply = makeReply();
    await call(req, reply);
    assert.equal(reply.sent, false);
    assert.equal(req.hmacVerified, true);
  });

  it("rejects when signature is missing", async () => {
    const reply = makeReply();
    const req = makeReq({}, { text: "x", requestId: "rid" });
    await call(req, reply);
    assert.equal(reply.sent, true);
    assert.equal(reply.code, 401);
  });

  it("rejects when body is missing requestId or text", async () => {
    const ts = Date.now().toString();
    const sig = sign(SECRET, ts, "rid", "x");
    const reply = makeReply();
    await call(makeReq({ "x-hb-timestamp": ts, "x-hb-signature": sig }, { text: "x" }), reply);
    assert.equal(reply.code, 401);
  });

  it("rejects a stale timestamp", async () => {
    const ts = (Date.now() - 60_000).toString(); // 1 min ago, max-skew is 5s
    const body = { text: "lights on", requestId: "rid-stale" };
    const sig = sign(SECRET, ts, body.requestId, body.text);
    const reply = makeReply();
    await call(makeReq({ "x-hb-timestamp": ts, "x-hb-signature": sig }, body), reply);
    assert.equal(reply.code, 401);
    assert.match(JSON.stringify(reply.payload), /stale/);
  });

  it("rejects a wrong signature with constant-time compare", async () => {
    const ts = Date.now().toString();
    const body = { text: "open the front gate", requestId: "rid-wrong" };
    const wrong = "0".repeat(64);
    const reply = makeReply();
    await call(makeReq({ "x-hb-timestamp": ts, "x-hb-signature": wrong }, body), reply);
    assert.equal(reply.code, 401);
    assert.match(JSON.stringify(reply.payload), /bad signature/);
  });

  it("rejects a signature of the wrong length without crashing", async () => {
    const ts = Date.now().toString();
    const body = { text: "x", requestId: "rid-short" };
    const reply = makeReply();
    await call(makeReq({ "x-hb-timestamp": ts, "x-hb-signature": "deadbeef" }, body), reply);
    assert.equal(reply.code, 401);
  });
});
