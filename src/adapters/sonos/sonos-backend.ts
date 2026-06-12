import { AsyncDeviceDiscovery, Sonos } from "sonos";
import { type SonosBackend, type ZoneConfig, type ZoneState } from "./backend.js";
import { log } from "../../core/log.js";

const DISCOVERY_TIMEOUT_MS = 8000;
const PLAY_STATES_THAT_MEAN_PLAYING = new Set(["playing", "transitioning"]);

interface SonosTrack {
  title?: string;
  artist?: string;
  album?: string;
  uri?: string;
}

interface SonosFavorite {
  title: string;
  uri: string;
  metadata?: string;
}

/**
 * Real Sonos backend using the `sonos` npm package (jishi's library, the
 * de-facto standard for LAN Sonos control).
 *
 * Discovery: at init() we scan the LAN for ~8s, get the friendly zone name
 * of every device found, and match those names against the zones declared
 * in house.yaml (case-insensitive). Unmatched declared zones log a warning
 * and stay offline until that zone shows up.
 *
 * Events: the `sonos` library auto-subscribes to UPnP events the moment
 * you attach any listener to a device, so attaching PlayState / Volume /
 * Muted / CurrentTrack handlers gives us push-based external state changes
 * — when someone presses pause on the Sonos app, we hear about it.
 *
 * Play queries: matched against the device's Sonos Favorites (case-
 * insensitive substring on title). Falls back to Sonos's
 * searchMusicLibrary for playlists when no favorite matches. This means
 * "play jazz rock" works if there's a Sonos favorite with "jazz" or "rock"
 * in the title — e.g. a saved Spotify playlist. No direct Spotify auth
 * needed; Sonos handles it through its existing service integration.
 */
export class RealSonosBackend implements SonosBackend {
  private devices = new Map<string, Sonos>();
  private expectedZoneByRoom = new Map<string, string>();
  private externalHandler: ((room: string, state: ZoneState) => void) | null = null;

  async init(zones: ZoneConfig[]): Promise<void> {
    for (const z of zones) this.expectedZoneByRoom.set(z.room, z.zoneName);
    log.info({ zones: zones.length }, "sonos: discovering on LAN");

    let found: Sonos[] = [];
    try {
      const discovery = new AsyncDeviceDiscovery();
      found = await discovery.discoverMultiple({ timeout: DISCOVERY_TIMEOUT_MS });
    } catch (err) {
      log.error({ err }, "sonos: discovery returned no devices");
      return;
    }
    log.info({ count: found.length }, "sonos: discovery complete");

    for (const device of found) {
      let name: string;
      try {
        name = await device.getName();
      } catch (err) {
        log.warn({ host: (device as { host?: string }).host, err }, "sonos: failed to read zone name");
        continue;
      }
      for (const z of zones) {
        if (z.zoneName.toLowerCase() === name.toLowerCase()) {
          this.devices.set(z.room, device);
          log.info(
            { room: z.room, zone: name, host: (device as { host?: string }).host },
            "sonos zone matched",
          );
          this.attachListeners(z.room, device);
          break;
        }
      }
    }

    for (const z of zones) {
      if (!this.devices.has(z.room)) {
        log.warn(
          { room: z.room, expectedZone: z.zoneName },
          "sonos zone not found on the LAN — check capitalization in house.yaml",
        );
      }
    }
  }

  private attachListeners(room: string, device: Sonos): void {
    // Attaching any listener triggers the library's implicit UPnP subscribe.
    const refresh = () => {
      void this.emitExternal(room, device);
    };
    device.on("PlayState", refresh);
    device.on("Volume", refresh);
    device.on("Muted", refresh);
    device.on("CurrentTrack", refresh);
  }

  private async emitExternal(room: string, device: Sonos): Promise<void> {
    if (!this.externalHandler) return;
    try {
      const state = await this.readState(device);
      this.externalHandler(room, state);
    } catch (err) {
      log.error({ err, room }, "sonos: failed to read state on external change");
    }
  }

  async getState(room: string): Promise<ZoneState> {
    const device = this.devices.get(room);
    if (!device) return { playing: false, online: false };
    return this.readState(device);
  }

  private async readState(device: Sonos): Promise<ZoneState> {
    try {
      const [state, track, volume, muted] = await Promise.all([
        device.getCurrentState() as Promise<string>,
        device.currentTrack() as Promise<SonosTrack>,
        device.getVolume() as Promise<number>,
        device.getMuted() as Promise<boolean>,
      ]);
      return {
        playing: PLAY_STATES_THAT_MEAN_PLAYING.has(state),
        track: track.title || undefined,
        artist: track.artist || undefined,
        album: track.album || undefined,
        source: track.uri || undefined,
        volume,
        muted,
        online: true,
      };
    } catch (err) {
      log.warn({ err }, "sonos: readState failed — device may be offline");
      return { playing: false, online: false };
    }
  }

  async play(room: string, query?: string, uri?: string): Promise<ZoneState> {
    const device = this.requireDevice(room);
    if (uri) {
      await device.play(uri);
    } else if (query) {
      const playable = await this.findPlayable(device, query);
      if (!playable) {
        throw new Error(
          `no Sonos favorite or playlist matches "${query}" in ${room}. ` +
            `Save the playlist as a Sonos favorite or to "My Sonos" in the app, ` +
            `or pass an explicit spotify: URI.`,
        );
      }
      await device.flush();
      await device.queue({ uri: playable.uri, metadata: playable.metadata });
      await device.play();
    } else {
      await device.play();
    }
    return this.readState(device);
  }

  /**
   * Find something playable matching the query. Two-stage search, ordered
   * by latency/specificity:
   *   1. Sonos Favorites — what the user explicitly pinned in "My Sonos".
   *      Fastest, highest signal: exact intent match.
   *   2. Sonos Playlists library — Spotify playlists the user has saved
   *      to Sonos in the app, plus any Sonos-native playlists. Broader
   *      net for ambient/genre requests like "smooth jazz" that the user
   *      may not have explicitly favorited.
   *
   * Both searches are case-insensitive substring matches on title.
   */
  private async findPlayable(device: Sonos, query: string): Promise<SonosFavorite | null> {
    const favHit = await this.searchFavorites(device, query);
    if (favHit) {
      log.info({ query, source: "favorite", title: favHit.title }, "sonos: play match");
      return favHit;
    }
    const plHit = await this.searchPlaylists(device, query);
    if (plHit) {
      log.info({ query, source: "sonos_playlists", title: plHit.title }, "sonos: play match");
      return plHit;
    }
    return null;
  }

  private async searchFavorites(device: Sonos, query: string): Promise<SonosFavorite | null> {
    try {
      const result = (await device.getFavorites()) as { items?: SonosFavorite[] };
      const items = result.items ?? [];
      const q = query.toLowerCase();
      return items.find((i) => i.title?.toLowerCase().includes(q)) ?? null;
    } catch (err) {
      log.warn({ err, query }, "sonos: getFavorites failed");
      return null;
    }
  }

  /**
   * Searches "Sonos Playlists" — the user's saved playlists on the Sonos
   * system. When you tap "Save Playlist to Sonos" on a Spotify playlist
   * in the Sonos app, it lands here. Means `play smooth jazz` finds the
   * user's saved Spotify "Smooth Jazz" playlist without needing it
   * explicitly favorited.
   */
  private async searchPlaylists(device: Sonos, query: string): Promise<SonosFavorite | null> {
    try {
      const result = (await device.searchMusicLibrary("sonos_playlists", query)) as {
        items?: SonosFavorite[];
      };
      const items = result.items ?? [];
      if (items.length === 0) return null;
      // Prefer titles that contain the query as a substring (defensive: some
      // Sonos firmwares return partial matches by other criteria).
      const q = query.toLowerCase();
      const exact = items.find((i) => i.title?.toLowerCase().includes(q));
      return exact ?? items[0] ?? null;
    } catch (err) {
      log.warn({ err, query }, "sonos: searchMusicLibrary(sonos_playlists) failed");
      return null;
    }
  }

  async pause(room: string): Promise<ZoneState> {
    const device = this.requireDevice(room);
    await device.pause();
    return this.readState(device);
  }

  async resume(room: string): Promise<ZoneState> {
    const device = this.requireDevice(room);
    await device.play();
    return this.readState(device);
  }

  async next(room: string): Promise<ZoneState> {
    const device = this.requireDevice(room);
    await device.next();
    return this.readState(device);
  }

  async previous(room: string): Promise<ZoneState> {
    const device = this.requireDevice(room);
    await device.previous();
    return this.readState(device);
  }

  async setVolume(room: string, value: number): Promise<ZoneState> {
    const device = this.requireDevice(room);
    await device.setVolume(Math.max(0, Math.min(100, Math.round(value))));
    return this.readState(device);
  }

  onExternalChange(handler: (room: string, state: ZoneState) => void): void {
    this.externalHandler = handler;
  }

  async close(): Promise<void> {
    for (const device of this.devices.values()) {
      try {
        (device as { removeAllListeners?: () => void }).removeAllListeners?.();
      } catch {
        // ignore
      }
    }
    this.devices.clear();
  }

  private requireDevice(room: string): Sonos {
    const device = this.devices.get(room);
    if (!device) {
      const expected = this.expectedZoneByRoom.get(room) ?? "?";
      throw new Error(
        `no Sonos device for room "${room}" — zone "${expected}" was not found on the LAN`,
      );
    }
    return device;
  }
}
