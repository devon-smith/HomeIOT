/** State payload published to home/{room}/tv/state. */
export interface TVState {
  on: boolean;
  input?: string;       // current source — "hdmi1", "apple_tv", brand-specific
  volume?: number;      // 0-100
  muted?: boolean;
  online: boolean;
}

export type Brand = "samsung" | "lg" | "sony" | "apple_tv" | "mock";

export interface TVConfig {
  room: string;
  brand: Brand;
  ip?: string;
  /** Brand-specific blob from house.yaml config. */
  config: Record<string, unknown>;
}

/**
 * Backend abstraction — one backend per brand. The adapter holds a map of
 * brand → backend and routes per-TV commands to the right one.
 */
export interface TVBackend {
  init(tvs: TVConfig[]): Promise<void>;
  getState(room: string): Promise<TVState>;
  setOn(room: string, on: boolean): Promise<TVState>;
  setInput(room: string, input: string): Promise<TVState>;
  setVolume(room: string, value: number): Promise<TVState>;
  setMuted(room: string, muted: boolean): Promise<TVState>;
  onExternalChange(handler: (room: string, state: TVState) => void): void;
  close(): Promise<void>;
}
