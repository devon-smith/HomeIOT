/**
 * Print every Sonos Favorite + Sonos Playlist visible on the LAN.
 *
 * Usage on the mini:
 *
 *   pnpm sonos:list
 *   pnpm sonos:list --markdown        # paste-ready markdown table
 *   pnpm sonos:list --json            # raw JSON for further scripting
 *
 * Why: when you want to tune `starred_playlists` in house.yaml or pick
 * unambiguous trigger names for Alexa Routines, you need to know what
 * names actually exist in your Sonos library. Substring matches against
 * these are what the brain's set_music tool resolves at play time, so
 * picking names with strong unique substrings (e.g. "coffee table" not
 * "jazz") makes voice routing predictable.
 *
 * The script discovers any one Sonos device on the LAN (favorites and
 * playlists are household-wide, not per-zone, so one device is enough),
 * pulls both lists, dedupes, and prints them.
 */
import { AsyncDeviceDiscovery, type Sonos } from "sonos";

const DISCOVERY_TIMEOUT_MS = 8000;

interface Item {
  title: string;
  uri: string;
  source: "favorite" | "sonos_playlist";
}

interface SonosWithFavorites extends Sonos {
  getFavorites(): Promise<{ items?: Array<{ title: string; uri: string }> }>;
  searchMusicLibrary(
    type: string,
    term: string | null,
  ): Promise<{ items?: Array<{ title: string; uri: string }> }>;
}

async function discoverOne(): Promise<Sonos> {
  const disc = new AsyncDeviceDiscovery();
  // One device is enough; favorites + sonos_playlists are household-wide.
  const all = await disc.discoverMultiple({ timeout: DISCOVERY_TIMEOUT_MS });
  const first = all[0];
  if (!first) throw new Error("no Sonos devices found on the LAN");
  return first;
}

async function listFavorites(device: SonosWithFavorites): Promise<Item[]> {
  try {
    const r = await device.getFavorites();
    return (r.items ?? []).map((it) => ({
      title: it.title,
      uri: it.uri,
      source: "favorite" as const,
    }));
  } catch (err) {
    console.error("[warn] getFavorites failed:", (err as Error).message);
    return [];
  }
}

async function listPlaylists(device: SonosWithFavorites): Promise<Item[]> {
  try {
    const r = await device.searchMusicLibrary("sonos_playlists", null);
    return (r.items ?? []).map((it) => ({
      title: it.title,
      uri: it.uri,
      source: "sonos_playlist" as const,
    }));
  } catch (err) {
    console.error("[warn] searchMusicLibrary(sonos_playlists) failed:", (err as Error).message);
    return [];
  }
}

function suggestQuery(title: string): string {
  // The set_music tool does a case-insensitive substring match on title.
  // Take the first 2-3 words and lowercase — usually unique enough.
  const lower = title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
  const words = lower.split(/\s+/).slice(0, 3);
  return words.join(" ");
}

function ambiguityWarnings(items: Item[]): string[] {
  // Flag titles whose first-3-words substring matches more than one item —
  // voice "play X" would be ambiguous between them.
  const buckets = new Map<string, Item[]>();
  for (const it of items) {
    const key = suggestQuery(it.title);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }
  const warnings: string[] = [];
  for (const [key, arr] of buckets) {
    if (arr.length > 1) {
      warnings.push(
        `"${key}" matches ${arr.length} items: ${arr.map((a) => a.title).join(" | ")}`,
      );
    }
  }
  return warnings;
}

function printTable(items: Item[]): void {
  console.log("");
  console.log(`${items.length} total · favorites=${items.filter((i) => i.source === "favorite").length} · sonos_playlists=${items.filter((i) => i.source === "sonos_playlist").length}`);
  console.log("");
  console.log("Source           Voice phrase (suggested)            Title");
  console.log("---------------- ----------------------------------- -------------------------------------------------");
  for (const it of items) {
    const src = it.source.padEnd(16);
    const q = `"play ${suggestQuery(it.title)} in the kitchen"`.padEnd(35);
    console.log(`${src} ${q} ${it.title}`);
  }
  const w = ambiguityWarnings(items);
  if (w.length) {
    console.log("");
    console.log("Ambiguity warnings (voice may pick the wrong one):");
    for (const line of w) console.log("  - " + line);
  }
  console.log("");
  console.log("Paste-ready house.yaml block (edit rooms/volume/mood to taste):");
  console.log("starred_playlists:");
  for (const it of items.slice(0, 8)) {
    const q = suggestQuery(it.title);
    console.log(`  - { label: "${it.title}", query: "${q}", rooms: [kitchen, family_room], volume: 25 }`);
  }
}

function printMarkdown(items: Item[]): void {
  console.log("");
  console.log("| Source | Voice phrase | Title |");
  console.log("|---|---|---|");
  for (const it of items) {
    console.log(`| ${it.source} | \`play ${suggestQuery(it.title)} in the kitchen\` | ${it.title.replace(/\|/g, "\\|")} |`);
  }
}

function printJson(items: Item[]): void {
  console.log(
    JSON.stringify(
      items.map((it) => ({ ...it, suggested_query: suggestQuery(it.title) })),
      null,
      2,
    ),
  );
}

async function main() {
  console.error(`[info] discovering Sonos on LAN (~${DISCOVERY_TIMEOUT_MS / 1000}s)...`);
  const device = (await discoverOne()) as SonosWithFavorites;
  const name = await device.getName().catch(() => "(unknown zone)");
  console.error(`[info] using zone "${name}"`);

  const favorites = await listFavorites(device);
  const playlists = await listPlaylists(device);

  // De-dupe by title (favorites and sonos_playlists can overlap when a user
  // both saved a Spotify playlist AND pinned it to My Sonos). Prefer the
  // "favorite" source since the adapter searches favorites first.
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const it of [...favorites, ...playlists]) {
    const key = it.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }
  items.sort((a, b) => a.title.localeCompare(b.title));

  const mode = process.argv.find((a) => a.startsWith("--"))?.slice(2);
  if (mode === "markdown") printMarkdown(items);
  else if (mode === "json") printJson(items);
  else printTable(items);
}

main().catch((err) => {
  console.error("[fatal]", err.message);
  process.exit(1);
});
