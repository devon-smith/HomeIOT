import mqtt, { type MqttClient } from "mqtt";
import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { log } from "./log.js";

const CLIENT_NAME = "home-brain-orchestrator";

export interface CommandMessage {
  id: string;
  ts: string;
  actor: string;
  op: string;
  args: Record<string, unknown>;
}

export interface StateMessage {
  ts: string;
  source: string;
  online: boolean;
  _cmd_id: string | null;
  pending: boolean;
  state: Record<string, unknown>;
}

export type StateHandler = (room: string, device: string, msg: StateMessage) => void;
export type EventHandler = (type: string, payload: unknown) => void;

export class Bus {
  private client: MqttClient | null = null;
  private stateHandlers: StateHandler[] = [];
  private eventHandlers: EventHandler[] = [];
  private pendingCommands = new Map<string, (msg: StateMessage) => void>();
  private ready = false;

  constructor(private url: string = config.MQTT_URL) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = mqtt.connect(this.url, {
        clientId: `${CLIENT_NAME}-${uuid().slice(0, 8)}`,
        clean: true,
        reconnectPeriod: 2000,
        connectTimeout: 10_000,
      });

      this.client.once("connect", () => {
        log.info({ url: this.url }, "mqtt connected");
        this.ready = true;
        this.client!.subscribe(["home/+/+/state", "home/_meta/adapter/+/health", "home/_events/#"], { qos: 1 }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      this.client.on("message", (topic, payload) => this.dispatch(topic, payload));
      this.client.on("error", (err) => log.error({ err }, "mqtt error"));
      this.client.on("reconnect", () => log.warn("mqtt reconnecting"));
      this.client.on("close", () => {
        if (this.ready) log.warn("mqtt connection closed");
      });
    });
  }

  private dispatch(topic: string, payload: Buffer): void {
    const parts = topic.split("/");
    try {
      const msg = JSON.parse(payload.toString());
      if (parts.length === 4 && parts[0] === "home" && parts[3] === "state") {
        const [, room, device] = parts;
        const stateMsg = msg as StateMessage;
        for (const h of this.stateHandlers) h(room!, device!, stateMsg);
        if (stateMsg._cmd_id) {
          const resolver = this.pendingCommands.get(stateMsg._cmd_id);
          if (resolver) resolver(stateMsg);
        }
      } else if (parts.length >= 3 && parts[0] === "home" && parts[1] === "_events") {
        const type = parts.slice(2).join("/");
        for (const h of this.eventHandlers) h(type, msg);
      }
    } catch (err) {
      log.error({ err, topic }, "failed to parse mqtt payload");
    }
  }

  /** Wait for a state echo carrying _cmd_id === cmdId, or reject after timeoutMs. */
  waitForCommand(cmdId: string, timeoutMs = 5000): Promise<StateMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(cmdId);
        reject(new Error(`command ${cmdId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingCommands.set(cmdId, (msg) => {
        clearTimeout(timer);
        this.pendingCommands.delete(cmdId);
        resolve(msg);
      });
    });
  }

  publishCommand(room: string, device: string, op: string, args: Record<string, unknown>, actor: string): string {
    if (!this.client) throw new Error("bus not connected");
    const cmd: CommandMessage = {
      id: uuid(),
      ts: new Date().toISOString(),
      actor,
      op,
      args,
    };
    this.client.publish(`home/${room}/${device}/command`, JSON.stringify(cmd), { qos: 1, retain: false });
    log.debug({ room, device, op, id: cmd.id }, "command published");
    return cmd.id;
  }

  publishEvent(type: string, payload: unknown): void {
    if (!this.client) throw new Error("bus not connected");
    this.client.publish(`home/_events/${type}`, JSON.stringify(payload), { qos: 1, retain: false });
  }

  onState(handler: StateHandler): void {
    this.stateHandlers.push(handler);
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    await new Promise<void>((resolve) => this.client!.end(false, {}, () => resolve()));
    this.client = null;
    this.ready = false;
  }
}
