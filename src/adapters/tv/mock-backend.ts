import { type TVBackend, type TVConfig, type TVState } from "./backend.js";

const DEFAULT_INPUTS = ["hdmi1", "hdmi2", "hdmi3", "apple_tv", "tv"];

/**
 * In-memory TV simulator for sandbox testing. All brands fall back to this
 * when TV_MODE=mock or when a brand stub isn't yet implemented.
 */
export class MockTVBackend implements TVBackend {
  private states = new Map<string, TVState>();
  private externalHandler: ((room: string, state: TVState) => void) | null = null;

  async init(tvs: TVConfig[]): Promise<void> {
    for (const tv of tvs) {
      this.states.set(tv.room, {
        on: false,
        input: "hdmi1",
        volume: 20,
        muted: false,
        online: true,
      });
    }
  }

  async getState(room: string): Promise<TVState> {
    return this.require(room);
  }

  async setOn(room: string, on: boolean): Promise<TVState> {
    const s = this.require(room);
    const next = { ...s, on };
    this.states.set(room, next);
    return next;
  }

  async setInput(room: string, input: string): Promise<TVState> {
    const s = this.require(room);
    // Accept any input slug. Real backends would validate against the actual
    // input map; we just record the requested value.
    const next = { ...s, on: true, input };
    this.states.set(room, next);
    return next;
  }

  async setVolume(room: string, value: number): Promise<TVState> {
    const s = this.require(room);
    const next = { ...s, volume: Math.max(0, Math.min(100, value)) };
    this.states.set(room, next);
    return next;
  }

  async setMuted(room: string, muted: boolean): Promise<TVState> {
    const s = this.require(room);
    const next = { ...s, muted };
    this.states.set(room, next);
    return next;
  }

  onExternalChange(handler: (room: string, state: TVState) => void): void {
    this.externalHandler = handler;
  }

  /** Test hook — simulate a user pressing the physical remote. */
  simulateExternalChange(room: string, patch: Partial<TVState>): void {
    const s = this.require(room);
    const next = { ...s, ...patch };
    this.states.set(room, next);
    this.externalHandler?.(room, next);
  }

  async close(): Promise<void> {
    this.states.clear();
  }

  private require(room: string): TVState {
    const s = this.states.get(room);
    if (!s) throw new Error(`unknown TV: ${room}`);
    return s;
  }
}

export { DEFAULT_INPUTS };
