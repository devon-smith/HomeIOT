/**
 * iMessage bridge — runs as a launchd agent on the Mac mini, tails
 * ~/Library/Messages/chat.db for new incoming messages, posts each to the
 * brain's POST /message endpoint, and sends the reply back via osascript.
 *
 * Requires Full Disk Access for the launchd process — chat.db is sandboxed.
 *
 * Mapping sender → actor: reads config/house.yaml, walks actors[*].imessage_handles
 * to find a match. Unmapped handles default to "guest" and the brain enforces
 * guest permissions.
 *
 * No native deps — uses the system sqlite3 CLI (built into macOS) and
 * osascript. Last-seen ROWID is persisted to ~/.home-brain/imessage-cursor.
 *
 * Smoke test note: this script is macOS-only. The pure-logic pieces
 * (handle → actor mapping, sqlite row parsing) are unit-tested in
 * scripts/imessage-bridge.test.ts.
 */

import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = parseInt(process.env["IMESSAGE_POLL_MS"] ?? "2000", 10);
const BRAIN_URL = process.env["BRAIN_URL"] ?? "http://localhost:3000";
const CHAT_DB = process.env["CHAT_DB"] ?? path.join(os.homedir(), "Library/Messages/chat.db");
const CURSOR_FILE = process.env["CURSOR_FILE"] ?? path.join(os.homedir(), ".home-brain/imessage-cursor");
const HOUSE_YAML = process.env["HOUSE_YAML"] ?? path.resolve("config/house.yaml");

interface ActorMap {
  [handle: string]: string; // handle (phone/AppleID) → actor slug
}

interface IncomingMessage {
  rowid: number;
  text: string;
  handle: string;
  timestampSec: number;
}

export function buildActorMap(houseYamlPath: string): ActorMap {
  const fallback = path.resolve("config/house.example.yaml");
  const resolved = fs.existsSync(houseYamlPath) ? houseYamlPath : fallback;
  const data = yaml.load(fs.readFileSync(resolved, "utf8")) as {
    actors?: Record<string, { imessage_handles?: string[] }>;
  };
  const map: ActorMap = {};
  for (const [actor, def] of Object.entries(data.actors ?? {})) {
    for (const handle of def.imessage_handles ?? []) {
      map[normalize(handle)] = actor;
    }
  }
  return map;
}

export function normalize(handle: string): string {
  // Strip US country code, parens, spaces, dashes; lowercase Apple IDs
  const trimmed = handle.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.replace(/[^\d+]/g, "");
}

export function resolveActor(handle: string, actorMap: ActorMap): string {
  return actorMap[normalize(handle)] ?? "guest";
}

function readCursor(): number {
  try {
    return parseInt(fs.readFileSync(CURSOR_FILE, "utf8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function writeCursor(rowid: number): void {
  fs.mkdirSync(path.dirname(CURSOR_FILE), { recursive: true });
  fs.writeFileSync(CURSOR_FILE, String(rowid), "utf8");
}

/**
 * Query chat.db for incoming messages since the cursor. Returns rows in
 * ascending ROWID order so we process oldest-first.
 */
export function querySinceRowid(chatDbPath: string, cursor: number): IncomingMessage[] {
  const sql = `
    SELECT message.ROWID as rowid,
           COALESCE(message.text, '') as text,
           handle.id as handle,
           CAST((message.date / 1000000000) + 978307200 AS INTEGER) as ts
    FROM message
    LEFT JOIN handle ON message.handle_id = handle.ROWID
    WHERE message.is_from_me = 0
      AND message.text IS NOT NULL
      AND message.ROWID > ${cursor}
    ORDER BY message.ROWID ASC
    LIMIT 100;
  `;
  let out: string;
  try {
    out = execFileSync("sqlite3", ["-json", chatDbPath, sql], { encoding: "utf8" });
  } catch (err) {
    // No new messages or empty result returns non-zero on some sqlite versions
    return [];
  }
  if (!out.trim()) return [];
  const rows = JSON.parse(out) as Array<{ rowid: number; text: string; handle: string | null; ts: number }>;
  return rows
    .filter((r) => r.handle && r.text)
    .map((r) => ({ rowid: r.rowid, text: r.text, handle: r.handle as string, timestampSec: r.ts }));
}

async function postToBrain(text: string, actor: string): Promise<{ response: string; ok: boolean }> {
  const r = await fetch(`${BRAIN_URL}/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, actor }),
  });
  const data = (await r.json()) as { response?: string; ok?: boolean };
  return { response: data.response ?? "(no response)", ok: data.ok ?? false };
}

/**
 * Send a reply via Messages.app over iMessage. Escapes the recipient and
 * body for AppleScript.
 */
export async function sendReply(handle: string, text: string): Promise<void> {
  const escapedHandle = handle.replace(/"/g, '\\"');
  const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const script = `tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy "${escapedHandle}" of targetService
    send "${escapedText}" to targetBuddy
  end tell`;
  await execFileAsync("osascript", ["-e", script]);
}

async function processMessage(msg: IncomingMessage, actorMap: ActorMap): Promise<void> {
  const actor = resolveActor(msg.handle, actorMap);
  console.log(`[imessage] ${msg.handle} (${actor}): ${msg.text}`);
  try {
    const { response, ok } = await postToBrain(msg.text, actor);
    console.log(`[imessage] reply (ok=${ok}): ${response}`);
    await sendReply(msg.handle, response);
  } catch (err) {
    console.error(`[imessage] failed:`, err);
    try {
      await sendReply(msg.handle, "Sorry — Home Brain is unreachable right now.");
    } catch {}
  }
}

async function poll(actorMap: ActorMap): Promise<void> {
  const cursor = readCursor();
  let messages: IncomingMessage[];
  try {
    messages = querySinceRowid(CHAT_DB, cursor);
  } catch (err) {
    console.error(`[imessage] query failed:`, err);
    return;
  }
  if (messages.length === 0) return;
  for (const msg of messages) {
    await processMessage(msg, actorMap);
    writeCursor(msg.rowid);
  }
}

async function main(): Promise<void> {
  console.log(`[imessage] starting bridge — db=${CHAT_DB} brain=${BRAIN_URL} poll=${POLL_INTERVAL_MS}ms`);
  if (!fs.existsSync(CHAT_DB)) {
    console.error(`[imessage] chat.db not found at ${CHAT_DB} — is this running on macOS with Full Disk Access?`);
    process.exit(1);
  }
  const actorMap = buildActorMap(HOUSE_YAML);
  console.log(`[imessage] mapped ${Object.keys(actorMap).length} handle(s) to actors`);

  // Initialize cursor to current max so we don't replay history on first start.
  if (readCursor() === 0) {
    try {
      const out = execFileSync("sqlite3", [CHAT_DB, "SELECT COALESCE(MAX(ROWID), 0) FROM message;"], { encoding: "utf8" });
      const maxRowid = parseInt(out.trim(), 10) || 0;
      writeCursor(maxRowid);
      console.log(`[imessage] initialized cursor to ${maxRowid}`);
    } catch (err) {
      console.error(`[imessage] cursor init failed:`, err);
    }
  }

  const tick = async () => {
    try {
      await poll(actorMap);
    } catch (err) {
      console.error(`[imessage] poll error:`, err);
    }
  };

  await tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
}

// Only run main() when invoked as a script (not when imported by tests)
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[imessage] fatal:", err);
    process.exit(1);
  });
}
