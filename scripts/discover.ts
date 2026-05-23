import dgram from "node:dgram";
import { Bonjour } from "bonjour-service";
import { Client as SSDPClient } from "node-ssdp";
import { config } from "../src/config.js";

// Common mDNS service types we care about. Querying `_services._dns-sd._udp` is
// the meta-query for "enumerate all advertised types" but isn't supported
// uniformly; this list covers the smart-home long tail.
const MDNS_TYPES = [
  "spotify-connect",
  "airplay",
  "raop",
  "googlecast",
  "hap",
  "http",
  "sonos",
  "appletv-v2",
  "homekit",
  "device-info",
  "_services._dns-sd",
];

/**
 * LAN discovery for Phase 0.
 *
 *  - mDNS / Bonjour: discovers everything that advertises itself (most smart TVs,
 *    HomeKit gear, printers, AirPlay endpoints, etc.).
 *  - SSDP: Sonos and other UPnP gear.
 *  - UDP broadcast on 6666/6667: Tuya devices announce themselves periodically.
 *    The packets are encrypted, but we can at least surface the source IPs;
 *    use `tinytuya wizard` to extract device IDs + local keys after this.
 *
 * Run for ~8s (configurable via DISCOVERY_TIMEOUT_MS) then print a grouped report.
 */

interface Found {
  source: "mdns" | "ssdp" | "tuya-udp";
  address?: string;
  port?: number;
  name?: string;
  service?: string;
  txt?: Record<string, string>;
  raw?: string;
}

const found: Found[] = [];

function dedupe(list: Found[]): Found[] {
  const seen = new Set<string>();
  return list.filter((f) => {
    const k = `${f.source}|${f.address ?? ""}|${f.port ?? ""}|${f.name ?? ""}|${f.service ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function scanMdns(): { stop: () => void } {
  const bonjour = new Bonjour();
  const browsers = MDNS_TYPES.map((type) =>
    bonjour.find({ type }, (svc) => {
      found.push({
        source: "mdns",
        address: svc.referer?.address ?? svc.addresses?.[0],
        port: svc.port,
        name: svc.name,
        service: svc.type ?? type,
        txt: (svc.txt as Record<string, string> | undefined) ?? undefined,
      });
    }),
  );
  return {
    stop: () => {
      browsers.forEach((b) => b.stop());
      bonjour.destroy();
    },
  };
}

function scanSsdp(): { stop: () => void } {
  const client = new SSDPClient();
  client.on("response", (headers, statusCode, rinfo) => {
    found.push({
      source: "ssdp",
      address: rinfo.address,
      port: rinfo.port,
      service: headers.ST as string | undefined,
      name: (headers["USN"] as string | undefined) ?? (headers["LOCATION"] as string | undefined),
    });
  });
  client.search("ssdp:all");
  return { stop: () => client.stop() };
}

function scanTuya(): { stop: () => void } {
  const sockets: dgram.Socket[] = [];
  for (const port of [6666, 6667]) {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    sock.on("message", (msg, rinfo) => {
      found.push({
        source: "tuya-udp",
        address: rinfo.address,
        port,
        raw: msg.toString("hex").slice(0, 64) + (msg.length > 32 ? "…" : ""),
      });
    });
    sock.on("error", (err) => {
      // EADDRINUSE etc. — log and move on, this is best-effort discovery.
      console.error(`[tuya:${port}] socket error: ${err.message}`);
    });
    sock.bind(port);
    sockets.push(sock);
  }
  return { stop: () => sockets.forEach((s) => s.close()) };
}

function printReport(list: Found[]): void {
  console.log("\n=== Discovery report ===\n");

  const mdns = list.filter((f) => f.source === "mdns");
  const ssdp = list.filter((f) => f.source === "ssdp");
  const tuya = list.filter((f) => f.source === "tuya-udp");

  console.log(`mDNS / Bonjour  : ${mdns.length} services`);
  for (const f of mdns) {
    console.log(`  ${f.service ?? "?"}  ${f.name ?? ""}  @ ${f.address ?? "?"}:${f.port ?? "?"}`);
  }

  console.log(`\nSSDP / UPnP     : ${ssdp.length} responses`);
  for (const f of ssdp) {
    console.log(`  ${f.service ?? "?"}  @ ${f.address ?? "?"}:${f.port ?? "?"}`);
  }

  console.log(`\nTuya UDP        : ${tuya.length} broadcasts`);
  for (const f of tuya) {
    console.log(`  ${f.address}  port ${f.port}  payload ${f.raw}`);
  }

  console.log(`\nTotal unique entries: ${list.length}`);
  console.log("\nNext steps:");
  console.log("  - For Sonos:    note the addresses showing 'urn:schemas-upnp-org:device:ZonePlayer:1' in SSDP.");
  console.log("  - For Control4: open Composer or check the Director IP your dealer gave you.");
  console.log("  - For Tuya:     run `tinytuya wizard` to extract device IDs and local keys.");
  console.log("  - Drop these into config/house.yaml to wire up the world.");
}

async function main() {
  console.log(`Scanning LAN for ${config.DISCOVERY_TIMEOUT_MS}ms...`);

  const mdns = scanMdns();
  const ssdp = scanSsdp();
  const tuya = scanTuya();

  await new Promise((r) => setTimeout(r, config.DISCOVERY_TIMEOUT_MS));

  mdns.stop();
  ssdp.stop();
  tuya.stop();

  printReport(dedupe(found));
  process.exit(0);
}

main().catch((err) => {
  console.error("discovery failed:", err);
  process.exit(1);
});
