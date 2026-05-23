import { type SonosBackend, type ZoneConfig, type ZoneState } from "./backend.js";

const MOCK_TRACKS = [
  { track: "Live at Leeds", artist: "The Who", album: "Live at Leeds" },
  { track: "Kind of Blue", artist: "Miles Davis", album: "Kind of Blue" },
  { track: "OK Computer", artist: "Radiohead", album: "OK Computer" },
  { track: "Random Access Memories", artist: "Daft Punk", album: "RAM" },
];

/**
 * In-memory Sonos simulator for sandbox testing. Holds per-zone state, advances
 * tracks on next/previous, and accepts arbitrary play queries.
 */
export class MockSonosBackend implements SonosBackend {
  private zones = new Map<string, ZoneState>();
  private trackIndex = new Map<string, number>();
  private externalHandler: ((room: string, state: ZoneState) => void) | null = null;

  async init(zones: ZoneConfig[]): Promise<void> {
    for (const z of zones) {
      this.zones.set(z.room, {
        playing: false,
        volume: 20,
        muted: false,
        online: true,
        source: "mock",
      });
      this.trackIndex.set(z.room, 0);
    }
  }

  async getState(room: string): Promise<ZoneState> {
    return this.require(room);
  }

  async play(room: string, query?: string, uri?: string): Promise<ZoneState> {
    const state = this.require(room);
    const idx = this.trackIndex.get(room) ?? 0;
    const track = MOCK_TRACKS[idx % MOCK_TRACKS.length]!;
    const next: ZoneState = {
      ...state,
      playing: true,
      track: query ? `Mock match for "${query}"` : (uri ? uri : track.track),
      artist: query ? "(simulated)" : track.artist,
      album: query ? undefined : track.album,
      source: uri ? "uri" : query ? "search" : "queue",
    };
    this.zones.set(room, next);
    return next;
  }

  async pause(room: string): Promise<ZoneState> {
    const state = this.require(room);
    const next = { ...state, playing: false };
    this.zones.set(room, next);
    return next;
  }

  async resume(room: string): Promise<ZoneState> {
    const state = this.require(room);
    const next = { ...state, playing: true };
    this.zones.set(room, next);
    return next;
  }

  async next(room: string): Promise<ZoneState> {
    const state = this.require(room);
    const idx = ((this.trackIndex.get(room) ?? 0) + 1) % MOCK_TRACKS.length;
    this.trackIndex.set(room, idx);
    const track = MOCK_TRACKS[idx]!;
    const next: ZoneState = { ...state, playing: true, track: track.track, artist: track.artist, album: track.album, source: "queue" };
    this.zones.set(room, next);
    return next;
  }

  async previous(room: string): Promise<ZoneState> {
    const state = this.require(room);
    const idx = ((this.trackIndex.get(room) ?? 0) - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length;
    this.trackIndex.set(room, idx);
    const track = MOCK_TRACKS[idx]!;
    const next: ZoneState = { ...state, playing: true, track: track.track, artist: track.artist, album: track.album, source: "queue" };
    this.zones.set(room, next);
    return next;
  }

  async setVolume(room: string, value: number): Promise<ZoneState> {
    const state = this.require(room);
    const next = { ...state, volume: Math.max(0, Math.min(100, value)) };
    this.zones.set(room, next);
    return next;
  }

  onExternalChange(handler: (room: string, state: ZoneState) => void): void {
    this.externalHandler = handler;
  }

  /** Test hook: simulate someone pressing pause in the Sonos app. */
  simulateExternalChange(room: string, patch: Partial<ZoneState>): void {
    const state = this.require(room);
    const next = { ...state, ...patch };
    this.zones.set(room, next);
    this.externalHandler?.(room, next);
  }

  async close(): Promise<void> {
    this.zones.clear();
  }

  private require(room: string): ZoneState {
    const s = this.zones.get(room);
    if (!s) throw new Error(`unknown zone: ${room}`);
    return s;
  }
}
