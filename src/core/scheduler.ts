import { type ToolCall } from "../intent/types.js";
import { log } from "./log.js";

export interface ScheduledJob {
  id: string;
  fireAt: Date;
  actions: ToolCall[];
  label?: string;
  actor: string;
}

export type ScheduledExec = (job: ScheduledJob) => Promise<void>;

export interface Scheduler {
  /** Register a job to fire at job.fireAt. Fires immediately if fireAt is past. */
  schedule(job: ScheduledJob): Promise<void>;
  cancel(id: string): Promise<void>;
  list(): Promise<ScheduledJob[]>;
  /** Re-queue any persisted-but-unfired jobs on startup. */
  loadPending(): Promise<void>;
  close(): Promise<void>;
}

/**
 * In-memory scheduler — no durability. Survives the lifetime of this process
 * only. Suitable for the sandbox smoke tests and for early development. For
 * production reboot-safety, swap in a BullMQ-backed scheduler that persists
 * to Postgres (see M3 done-when criterion in ROADMAP.md and the stub at the
 * bottom of this file).
 */
export class MemoryScheduler implements Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private jobs = new Map<string, ScheduledJob>();

  constructor(private exec: ScheduledExec) {}

  async schedule(job: ScheduledJob): Promise<void> {
    this.jobs.set(job.id, job);
    const delay = job.fireAt.getTime() - Date.now();
    if (delay <= 0) {
      // Fire on the next tick so the caller can observe the scheduled state first.
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

  async list(): Promise<ScheduledJob[]> {
    return Array.from(this.jobs.values());
  }

  async loadPending(): Promise<void> {
    // In-memory: nothing persisted, nothing to load.
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
    } finally {
      this.jobs.delete(id);
    }
  }
}

/**
 * BullMQ-backed scheduler — durable across restarts via the Postgres
 * scheduled_jobs table + a Redis-backed BullMQ queue. Implementation lands
 * on the Mac mini (M3 follow-up).
 *
 * Sketch:
 *   1. On schedule(): write a row to scheduled_jobs (status=pending),
 *      then add a BullMQ job with delay = fireAt - now.
 *   2. On BullMQ processor fire: load the row, exec(), update status =
 *      fired | failed, set firedAt.
 *   3. On loadPending(): scan scheduled_jobs for status=pending and
 *      re-add to BullMQ. This is the "survives a Mac mini reboot" path.
 *   4. On cancel(): delete the BullMQ job and update status=cancelled.
 */
export class BullMQScheduler implements Scheduler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_exec: ScheduledExec, _redisUrl: string, _dbUrl: string) {}

  async schedule(_job: ScheduledJob): Promise<void> {
    throw new Error("BullMQScheduler not implemented — use MemoryScheduler in dev or implement on the Mac mini");
  }
  async cancel(_id: string): Promise<void> {
    throw new Error("BullMQScheduler not implemented");
  }
  async list(): Promise<ScheduledJob[]> {
    throw new Error("BullMQScheduler not implemented");
  }
  async loadPending(): Promise<void> {
    throw new Error("BullMQScheduler not implemented");
  }
  async close(): Promise<void> {
    // no-op for stub
  }
}
