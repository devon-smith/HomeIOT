/** State payload published to home/{room}/music/state. */
export interface ZoneState {
  playing: boolean;
  track?: string;
  artist?: string;
  album?: string;
  source?: string;
  volume?: number;
  muted?: boolean;
  online: boolean;
}

export interface ZoneConfig {
  room: string;
  zoneName: string;
}

/**
 * Backend abstraction: lets the adapter swap between mock and real Sonos with
 * no changes elsewhere.
 */
export interface SonosBackend {
  init(zones: ZoneConfig[]): Promise<void>;
  getState(room: string): Promise<ZoneState>;
  play(room: string, query?: string, uri?: string): Promise<ZoneState>;
  pause(room: string): Promise<ZoneState>;
  resume(room: string): Promise<ZoneState>;
  next(room: string): Promise<ZoneState>;
  previous(room: string): Promise<ZoneState>;
  setVolume(room: string, value: number): Promise<ZoneState>;
  /**
   * Subscribe to state changes that did not originate from a command issued via
   * this adapter — e.g. someone pressing pause in the Sonos app.
   */
  onExternalChange(handler: (room: string, state: ZoneState) => void): void;
  close(): Promise<void>;
}
