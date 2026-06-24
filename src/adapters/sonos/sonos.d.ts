// Minimal type declarations for the `sonos` npm package (jishi v1.14).
// Only covers the surface RealSonosBackend uses. The package itself is JS
// with no published types and no @types/sonos on npm.

declare module "sonos" {
  import { EventEmitter } from "node:events";

  export class Sonos extends EventEmitter {
    constructor(host: string, port?: number);
    readonly host: string;

    getName(): Promise<string>;
    getCurrentState(): Promise<string>;
    currentTrack(): Promise<{
      title?: string;
      artist?: string;
      album?: string;
      uri?: string;
      duration?: number;
      position?: number;
    }>;
    getVolume(): Promise<number>;
    getMuted(): Promise<boolean>;
    getZoneInfo(): Promise<unknown>;
    getZoneAttrs(): Promise<unknown>;
    getFavorites(): Promise<{ items?: Array<{ title: string; uri: string; metadata?: string }> }>;

    /**
     * Search the device's music library by type. searchType is one of
     * 'playlists' | 'tracks' | 'albums' | 'artists' | 'composers' |
     * 'genres' | 'share' | 'sonos_playlists'. Returns { items: [...] }
     * where each item has title + uri + metadata.
     *
     * Useful for finding Spotify content saved to Sonos (sonos_playlists
     * picks up Spotify playlists the user saved to Sonos in the app)
     * even when there is no matching Sonos Favorite.
     */
    searchMusicLibrary(
      searchType: string,
      searchTerm: string | null,
      requestOptions?: Record<string, unknown>,
      separator?: string,
    ): Promise<{ items?: Array<{ title: string; uri: string; metadata?: string }> }>;

    play(uri?: string | { uri: string; metadata?: string }): Promise<unknown>;
    pause(): Promise<unknown>;
    stop(): Promise<unknown>;
    next(): Promise<unknown>;
    previous(): Promise<unknown>;
    setVolume(volume: number, channel?: string): Promise<unknown>;
    setMuted(muted: boolean, channel?: string): Promise<unknown>;
    queue(options: { uri: string; metadata?: string }, positionInQueue?: number): Promise<unknown>;
    flush(): Promise<unknown>;
    /**
     * Set the AVTransport play mode. Accepts: NORMAL, REPEAT_ALL, REPEAT_ONE,
     * SHUFFLE_NOREPEAT, SHUFFLE (= shuffle + repeat all), SHUFFLE_REPEAT_ONE.
     */
    setPlayMode(mode: string): Promise<unknown>;
  }

  export class AsyncDeviceDiscovery {
    discover(options?: { timeout?: number }): Promise<Sonos>;
    discoverMultiple(options?: { timeout?: number }): Promise<Sonos[]>;
  }

  export const DeviceDiscovery: (options?: { timeout?: number }) => EventEmitter;
  export const Helpers: Record<string, unknown>;
  export const Listener: { subscribeTo(device: Sonos): Promise<unknown> };
  export const Search: unknown;
  export const Services: Record<string, unknown>;
  export const SpotifyRegion: Record<string, string>;
}
