import { type SonosBackend, type ZoneConfig, type ZoneState } from "./backend.js";

/**
 * Real Sonos backend stub. Implementation lands on the Mac mini.
 *
 * To wire up:
 *   1. `pnpm add sonos`
 *   2. Use `AsyncDeviceDiscovery` from the `sonos` package to discover zones.
 *   3. Map each ZoneConfig.zoneName to a `Sonos` device instance by zone name.
 *   4. Implement play/pause/etc. via the device's methods (device.play(), etc.).
 *   5. Subscribe to UPnP events for external state changes — the `sonos`
 *      package exposes `device.on('PlaybackStopped', ...)` etc.
 *
 * See docs/ADAPTER_GUIDE.md for the contract every backend must satisfy.
 */
export class RealSonosBackend implements SonosBackend {
  async init(_zones: ZoneConfig[]): Promise<void> {
    throw new Error("RealSonosBackend not implemented — set SONOS_MODE=mock for now, or implement against the `sonos` npm package");
  }
  async getState(_room: string): Promise<ZoneState> { throw new Error("not implemented"); }
  async play(_room: string, _query?: string, _uri?: string): Promise<ZoneState> { throw new Error("not implemented"); }
  async pause(_room: string): Promise<ZoneState> { throw new Error("not implemented"); }
  async resume(_room: string): Promise<ZoneState> { throw new Error("not implemented"); }
  async next(_room: string): Promise<ZoneState> { throw new Error("not implemented"); }
  async previous(_room: string): Promise<ZoneState> { throw new Error("not implemented"); }
  async setVolume(_room: string, _value: number): Promise<ZoneState> { throw new Error("not implemented"); }
  onExternalChange(_handler: (room: string, state: ZoneState) => void): void {}
  async close(): Promise<void> {}
}
