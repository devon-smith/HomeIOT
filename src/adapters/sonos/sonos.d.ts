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

    play(uri?: string | { uri: string; metadata?: string }): Promise<unknown>;
    pause(): Promise<unknown>;
    stop(): Promise<unknown>;
    next(): Promise<unknown>;
    previous(): Promise<unknown>;
    setVolume(volume: number, channel?: string): Promise<unknown>;
    setMuted(muted: boolean, channel?: string): Promise<unknown>;
    queue(options: { uri: string; metadata?: string }, positionInQueue?: number): Promise<unknown>;
    flush(): Promise<unknown>;
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
