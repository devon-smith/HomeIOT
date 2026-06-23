import { Queue, Worker, type Job as BullJob } from "bullmq";
import IORedis from "ioredis";
import { type ToolCall } from "../intent/types.js";
import { log } from "./log.js";
import { prisma } from "./db.js";
import { nextSolar } from "./solar.js";

/**
 * Recurrence patterns. The scheduler re-queues the next occurrence after
 * each fire. `null` / undefined = one-shot job.
 */
export type Recurrence = "daily" | "weekdays" | "weekends" | "weekly" | null;

export interface SolarTrigger {
  kind: "sunrise" | "sunset";
  offsetMinutes?: number; // -30 = 30 min before
}

export interface ScheduledJob {
  id: string;
  fireAt: Date;
  actions: ToolCall[];
  label?: string;
  actor: string;
  recurrence?: Recurrence;
  trigger?: SolarTrigger; // when set, fireAt is computed from this every time
}

export type ScheduledExec = (job: ScheduledJob) => Promise<void>;

export interface Scheduler {
  schedule(job: ScheduledJob): Promise<void>;
  cancel(id: string): Promise<void>;
  /** Move fireAt by delta minutes (positive = later). */
  snooze(id: string, byMinutes: number): Promise<ScheduledJob | null>;
  list(): Promise<ScheduledJob[]>;
  loadPending(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Compute the next fire time for a job. Handles solar triggers (recomputed
 * fresh) and recurrence (rolls fireAt forward).
 */
export function nextFireAt(
  job: ScheduledJob,
  location: { latitude: number; longitude: number } | undefined,
  now = new Date(),
): Date | null {
  if (job.trigger) {
    if (!location) {
      log.warn({ jobId: job.id }, "solar trigger requested but house.location unset; falling back to fireAt as-is");
      return null;
    }
    return nextSolar(now, job.trigger.kind, location.latitude, location.longitude, job.trigger.offsetMinutes ?? 0);
  }
  if (!job.recurrence || job.recurrence === null) return null;
  // Roll fireAt forward to the next occurrence after `now`.
  const next = new Date(job.fireAt.getTime());
  // First catch up to "today's" version at the same time-of-day.
  if (next.getTime() < now.getTime()) {
    next.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  } else {
    // Already in the future — bump by the recurrence interval.
    if (job.recurrence === "daily" || job.recurrence === "weekdays" || job.recurrence === "weekends") {
      next.setUTCDate(next.getUTCDate() + 1);
    } else if (job.recurrence === "weekly") {
      next.setUTCDate(next.getUTCDate() + 7);
    }
  }
  // Skip days that don't match the pattern.
  for (let i = 0; i < 7; i++) {
    const dow = next.getUTCDay(); // 0=Sun .. 6=Sat (close enough to local for our use)
    if (job.recurrence === "weekdays" && (dow === 0 || dow === 6)) {
      next.setUTCDate(next.getUTCDate() + 1);
      continue;
    }
    if (job.recurrence === "weekends" && !(dow === 0 || dow === 6)) {
      next.setUTCDate(next.getUTCDate() + 1);
      continue;
    }
    break;
  }
  return next;
}

/**
 * In-memory scheduler — process-lifetime only. Used in tests + smoke + as a
 * fallback when Redis isn't reachable.
 */
export class MemoryScheduler implements Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private jobs = new Map<string, ScheduledJob>();

  constructor(
    private exec: ScheduledExec,
    private location?: { latitude: number; longitude: number },
  ) {}

  async schedule(job: ScheduledJob): Promise<void> {
    this.jobs.set(job.id, job);
    this.queueTimer(job);
  }

  private queueTimer(job: ScheduledJob): void {
    const delay = job.fireAt.getTime() - Date.now();
    if (delay <= 0) {
      setImmediate(() => void this.fire(job.id));
      return;
    }
    const timer = setTimeout(() => void this.fire(job.id), delay);
    this.timers.set(job.id, timer);
  }

  async cancel(id: string): Promise<void> {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    this.jobs.delete(id);
  }

  async snooze(id: string, byMinutes: number): Promise<ScheduledJob | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    job.fireAt = new Date(job.fireAt.getTime() + byMinutes * 60_000);
    this.queueTimer(job);
    return job;
  }

  async list(): Promise<ScheduledJob[]> {
    return Array.from(this.jobs.values());
  }

  async loadPending(): Promise<void> {
    // In-memory: nothing persisted.
  }

  async close(): Promise<void> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.jobs.clear();
  }

  private async fire(id: string): Promise<void> {
    this.timers.delete(id);
    const job = this.jobs.get(id);
    if (!job) return;
    try {
      await this.exec(job);
    } catch (err) {
      log.error({ err, jobId: id }, "scheduled job exec failed");
    }
    // Re-schedule if recurring or solar-triggered.
    const nxt = nextFireAt(job, this.location);
    if (nxt) {
      job.fireAt = nxt;
      this.queueTimer(job);
    } else {
      this.jobs.delete(id);
    }
  }
}

/**
 * BullMQ-backed scheduler — durable across restarts. Persists to the
 * scheduled_jobs Postgres table for visibility / audit + BullMQ on Redis
 * for the actual delayed queue. On startup, loadPending() re-queues every
 * row with status=pending whose fireAt is still in the future (or past —
 * those fire immediately, which is the correct catch-up behaviour).
 *
 * Job ID convention: BullMQ job name = ScheduledJob.id (uuid).
 */
const QUEUE_NAME = "home-brain-scheduled";

interface PersistedActionSpec {
  v: 2;
  actions: ToolCall[];
  recurrence?: Recurrence;
  trigger?: SolarTrigger;
}

function encodeActionSpec(job: ScheduledJob): PersistedActionSpec {
  return {
    v: 2,
    actions: job.actions,
    recurrence: job.recurrence ?? null,
    trigger: job.trigger,
  };
}

function decodeActionSpec(raw: unknown): { actions: ToolCall[]; recurrence?: Recurrence; trigger?: SolarTrigger } {
  if (Array.isArray(raw)) {
    // v1 (legacy): just an array of actions.
    return { actions: raw as ToolCall[] };
  }
  const v = raw as PersistedActionSpec;
  return {
    actions: v.actions ?? [],
    recurrence: v.recurrence ?? null,
    trigger: v.trigger,
  };
}

export class BullMQScheduler implements Scheduler {
  private connection: IORedis;
  private queue: Queue;
  private worker: Worker | null = null;
  private closing = false;

  constructor(
    private exec: ScheduledExec,
    redisUrl: string,
    private location?: { latitude: number; longitude: number },
  ) {
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  async schedule(job: ScheduledJob): Promise<void> {
    const spec = encodeActionSpec(job);
    await prisma.scheduledJob.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        fireAt: job.fireAt,
        actionSpec: spec as unknown as object,
        label: job.label,
        actor: job.actor,
        status: "pending",
      },
      update: {
        fireAt: job.fireAt,
        actionSpec: spec as unknown as object,
        label: job.label,
        status: "pending",
        firedAt: null,
        error: null,
      },
    });
    // Drop any existing BullMQ job with this id so re-schedules don't dupe.
    const existing = await this.queue.getJob(job.id);
    if (existing) await existing.remove().catch(() => undefined);

    const delay = Math.max(0, job.fireAt.getTime() - Date.now());
    await this.queue.add(
      job.id,
      { id: job.id }, // payload — we re-read from postgres for the canonical state
      { jobId: job.id, delay, removeOnComplete: true, removeOnFail: { age: 86400 } },
    );
    log.info({ jobId: job.id, fireAt: job.fireAt.toISOString(), delayMs: delay }, "scheduled (bullmq)");
  }

  async cancel(id: string): Promise<void> {
    const j = await this.queue.getJob(id);
    if (j) await j.remove().catch(() => undefined);
    await prisma.scheduledJob.update({
      where: { id },
      data: { status: "cancelled" },
    }).catch(() => undefined);
  }

  async snooze(id: string, byMinutes: number): Promise<ScheduledJob | null> {
    const row = await prisma.scheduledJob.findUnique({ where: { id } });
    if (!row || row.status !== "pending") return null;
    const newFire = new Date(row.fireAt.getTime() + byMinutes * 60_000);
    const spec = decodeActionSpec(row.actionSpec);
    const job: ScheduledJob = {
      id: row.id,
      fireAt: newFire,
      actions: spec.actions,
      label: row.label ?? undefined,
      actor: row.actor,
      recurrence: spec.recurrence,
      trigger: spec.trigger,
    };
    await this.schedule(job);
    return job;
  }

  async list(): Promise<ScheduledJob[]> {
    const rows = await prisma.scheduledJob.findMany({
      where: { status: "pending" },
      orderBy: { fireAt: "asc" },
    });
    return rows.map((row) => {
      const spec = decodeActionSpec(row.actionSpec);
      return {
        id: row.id,
        fireAt: row.fireAt,
        actions: spec.actions,
        label: row.label ?? undefined,
        actor: row.actor,
        recurrence: spec.recurrence,
        trigger: spec.trigger,
      };
    });
  }

  async loadPending(): Promise<void> {
    const rows = await prisma.scheduledJob.findMany({ where: { status: "pending" } });
    let recovered = 0;
    let skipped = 0;
    for (const row of rows) {
      const j = await this.queue.getJob(row.id);
      if (j) { skipped++; continue; } // already in the queue (Redis survived)
      const spec = decodeActionSpec(row.actionSpec);
      const delay = Math.max(0, row.fireAt.getTime() - Date.now());
      await this.queue.add(
        row.id,
        { id: row.id },
        { jobId: row.id, delay, removeOnComplete: true, removeOnFail: { age: 86400 } },
      );
      recovered++;
    }
    if (recovered || skipped) {
      log.info({ recovered, skipped, total: rows.length }, "bullmq: rehydrated pending jobs");
    }
    this.startWorker();
  }

  private startWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(
      QUEUE_NAME,
      async (bull: BullJob) => {
        const id = (bull.data as { id: string }).id;
        const row = await prisma.scheduledJob.findUnique({ where: { id } });
        if (!row || row.status !== "pending") return;
        const spec = decodeActionSpec(row.actionSpec);
        const job: ScheduledJob = {
          id: row.id,
          fireAt: row.fireAt,
          actions: spec.actions,
          label: row.label ?? undefined,
          actor: row.actor,
          recurrence: spec.recurrence,
          trigger: spec.trigger,
        };
        try {
          await this.exec(job);
          await prisma.scheduledJob.update({
            where: { id },
            data: { status: "fired", firedAt: new Date() },
          });
        } catch (err) {
          await prisma.scheduledJob.update({
            where: { id },
            data: { status: "failed", firedAt: new Date(), error: String(err) },
          });
          throw err;
        }
        // Re-queue if recurring or solar.
        const nxt = nextFireAt(job, this.location);
        if (nxt && !this.closing) {
          job.fireAt = nxt;
          // Insert a fresh row so the audit trail isn't lost.
          job.id = crypto.randomUUID();
          await this.schedule(job);
        }
      },
      { connection: this.connection, concurrency: 4 },
    );
    this.worker.on("failed", (j, err) => {
      log.error({ err: err.message, jobId: j?.id }, "bullmq job failed");
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.worker) await this.worker.close().catch(() => undefined);
    await this.queue.close().catch(() => undefined);
    this.connection.disconnect();
  }
}
