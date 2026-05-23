import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalize, resolveActor, buildActorMap } from "./imessage-bridge.js";

describe("imessage normalize", () => {
  it("strips formatting from phone numbers", () => {
    assert.equal(normalize("+1 (555) 123-4567"), "+15551234567");
    assert.equal(normalize("(555) 123-4567"), "5551234567");
    assert.equal(normalize("555.123.4567"), "5551234567");
  });
  it("lowercases Apple ID emails", () => {
    assert.equal(normalize("Owner@iCloud.com"), "owner@icloud.com");
  });
  it("trims whitespace", () => {
    assert.equal(normalize("  +15551234567  "), "+15551234567");
  });
});

describe("imessage resolveActor", () => {
  const map = {
    "+15551234567": "owner",
    "+15559876543": "partner",
    "alice@example.com": "guest_alice",
  };

  it("maps known phone", () => {
    assert.equal(resolveActor("+1 (555) 123-4567", map), "owner");
  });
  it("maps known email", () => {
    assert.equal(resolveActor("Alice@example.com", map), "guest_alice");
  });
  it("falls back to 'guest' for unknown", () => {
    assert.equal(resolveActor("+15550000000", map), "guest");
    assert.equal(resolveActor("stranger@nowhere.com", map), "guest");
  });
});

describe("imessage buildActorMap", () => {
  it("walks house.yaml actors", () => {
    const tmp = path.join(os.tmpdir(), `house-${Date.now()}.yaml`);
    fs.writeFileSync(
      tmp,
      `actors:
  owner:
    role: owner
    imessage_handles:
      - "+1 (555) 123-4567"
      - "Owner@icloud.com"
  partner:
    role: partner
    imessage_handles: ["+15559876543"]
  guest_alice:
    role: guest
    imessage_handles: []
`,
      "utf8",
    );
    const map = buildActorMap(tmp);
    assert.equal(map["+15551234567"], "owner");
    assert.equal(map["owner@icloud.com"], "owner");
    assert.equal(map["+15559876543"], "partner");
    // guest_alice has no handles → not in map
    assert.equal(Object.values(map).includes("guest_alice"), false);
    fs.unlinkSync(tmp);
  });
});
