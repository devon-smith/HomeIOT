import { type TVBackend, type TVConfig, type TVState } from "./backend.js";

const NOT_IMPLEMENTED = (brand: string) =>
  new Error(
    `${brand} TV backend not implemented — set TV_MODE=mock for now, or implement against the brand-specific library on the Mac mini.`,
  );

/**
 * Samsung Tizen TV stub.
 *
 * To wire up:
 *   1. `pnpm add samsung-tv-control` (or samsungtvws-style WebSocket)
 *   2. On init(), pair with each TV by IP — token-based auth requires the
 *      TV to display a prompt the first time; cache the token to disk
 *      under ~/.home-brain/samsung-tokens/{room}.json
 *   3. setOn(true) uses Wake-on-LAN (TV must be in standby, not unplugged)
 *   4. setOn(false) sends KEY_POWEROFF
 *   5. setInput maps to KEY_HDMI1/KEY_HDMI2/... — the map is per-model
 *   6. Subscribe to WebSocket events for external state changes
 */
export class SamsungTVBackend implements TVBackend {
  async init(_tvs: TVConfig[]): Promise<void> { throw NOT_IMPLEMENTED("samsung"); }
  async getState(_room: string): Promise<TVState> { throw NOT_IMPLEMENTED("samsung"); }
  async setOn(_room: string, _on: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("samsung"); }
  async setInput(_room: string, _input: string): Promise<TVState> { throw NOT_IMPLEMENTED("samsung"); }
  async setVolume(_room: string, _value: number): Promise<TVState> { throw NOT_IMPLEMENTED("samsung"); }
  async setMuted(_room: string, _muted: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("samsung"); }
  onExternalChange(_h: (room: string, state: TVState) => void): void {}
  async close(): Promise<void> {}
}

/**
 * LG webOS TV stub.
 *
 * To wire up:
 *   1. `pnpm add lgtv2` (or asyncwebostv)
 *   2. Pair with each TV — webOS shows a confirmation prompt the first
 *      time, then issues a client-key. Cache to ~/.home-brain/lg-keys/
 *   3. setOn(true) uses Wake-on-LAN; setOn(false) sends `system.turnOff`
 *   4. setInput maps to `tv.changeInput` with a source ID
 *   5. Subscribe to `system.foregroundAppInfo` for app/input changes
 */
export class LGTVBackend implements TVBackend {
  async init(_tvs: TVConfig[]): Promise<void> { throw NOT_IMPLEMENTED("lg"); }
  async getState(_room: string): Promise<TVState> { throw NOT_IMPLEMENTED("lg"); }
  async setOn(_room: string, _on: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("lg"); }
  async setInput(_room: string, _input: string): Promise<TVState> { throw NOT_IMPLEMENTED("lg"); }
  async setVolume(_room: string, _value: number): Promise<TVState> { throw NOT_IMPLEMENTED("lg"); }
  async setMuted(_room: string, _muted: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("lg"); }
  onExternalChange(_h: (room: string, state: TVState) => void): void {}
  async close(): Promise<void> {}
}

/**
 * Sony Bravia REST stub.
 *
 * To wire up:
 *   1. Use the built-in IP Control API — no npm package needed, just HTTP.
 *      Generate a PSK via the TV's Network → IP Control settings.
 *   2. Endpoints: `/sony/system` (power, system info), `/sony/avContent`
 *      (inputs, sources), `/sony/audio` (volume, mute).
 *   3. Auth via `X-Auth-PSK` header.
 *   4. Polling only — Bravia does not push events. Use 5-10s poll loop.
 */
export class SonyTVBackend implements TVBackend {
  async init(_tvs: TVConfig[]): Promise<void> { throw NOT_IMPLEMENTED("sony"); }
  async getState(_room: string): Promise<TVState> { throw NOT_IMPLEMENTED("sony"); }
  async setOn(_room: string, _on: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("sony"); }
  async setInput(_room: string, _input: string): Promise<TVState> { throw NOT_IMPLEMENTED("sony"); }
  async setVolume(_room: string, _value: number): Promise<TVState> { throw NOT_IMPLEMENTED("sony"); }
  async setMuted(_room: string, _muted: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("sony"); }
  onExternalChange(_h: (room: string, state: TVState) => void): void {}
  async close(): Promise<void> {}
}

/**
 * Apple TV stub.
 *
 * pyatv is Python-only. Either:
 *   (a) Wrap pyatv as a separate Python adapter under adapters-py/apple_tv/
 *       and remove apple_tv from this TS adapter's brand list, OR
 *   (b) Shell out to `atvremote` (pyatv's CLI) from here.
 * Recommended: (a). Cleaner separation, no shell exec overhead.
 */
export class AppleTVBackend implements TVBackend {
  async init(_tvs: TVConfig[]): Promise<void> { throw NOT_IMPLEMENTED("apple_tv"); }
  async getState(_room: string): Promise<TVState> { throw NOT_IMPLEMENTED("apple_tv"); }
  async setOn(_room: string, _on: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("apple_tv"); }
  async setInput(_room: string, _input: string): Promise<TVState> { throw NOT_IMPLEMENTED("apple_tv"); }
  async setVolume(_room: string, _value: number): Promise<TVState> { throw NOT_IMPLEMENTED("apple_tv"); }
  async setMuted(_room: string, _muted: boolean): Promise<TVState> { throw NOT_IMPLEMENTED("apple_tv"); }
  onExternalChange(_h: (room: string, state: TVState) => void): void {}
  async close(): Promise<void> {}
}
