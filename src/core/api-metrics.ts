/**
 * In-memory ring buffer of Claude API calls made by the planner. Surfaced by
 * GET /api-usage so the dashboard's Usage tab can show recent activity, daily
 * totals, and an estimated cost. Resets on brain restart — we'll persist to
 * the audit_log table later when costs become high enough to care about
 * history across reboots.
 */
import { config } from "../config.js";

export interface ApiCallRecord {
  ts: string;
  actor: string;
  route: "fast" | "llm" | "error";
  text: string;
  toolCalls: number;
  latencyMs: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
}

const RING_SIZE = 500;
const calls: ApiCallRecord[] = [];

export function recordApiCall(rec: Omit<ApiCallRecord, "ts" | "estCostUsd">): ApiCallRecord {
  const estCostUsd = estimateCost(rec);
  const full: ApiCallRecord = { ts: new Date().toISOString(), estCostUsd, ...rec };
  calls.push(full);
  if (calls.length > RING_SIZE) calls.shift();
  return full;
}

export function estimateCost(rec: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}): number {
  const inUsd = (rec.inputTokens / 1_000_000) * config.HB_PRICE_INPUT_PER_MTOK;
  const outUsd = (rec.outputTokens / 1_000_000) * config.HB_PRICE_OUTPUT_PER_MTOK;
  const cwUsd = (rec.cacheCreationInputTokens / 1_000_000) * config.HB_PRICE_CACHE_WRITE_PER_MTOK;
  const crUsd = (rec.cacheReadInputTokens / 1_000_000) * config.HB_PRICE_CACHE_READ_PER_MTOK;
  return Math.round((inUsd + outUsd + cwUsd + crUsd) * 1_000_000) / 1_000_000;
}

export interface UsageSummary {
  windowMs: number;
  calls: number;
  llmCalls: number;
  fastCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  estCostUsd: number;
  cacheHitRatio: number;
}

export function summarize(sinceMs: number): UsageSummary {
  const cutoff = Date.now() - sinceMs;
  const window = calls.filter((c) => new Date(c.ts).getTime() >= cutoff);
  const acc: UsageSummary = {
    windowMs: sinceMs,
    calls: window.length,
    llmCalls: 0,
    fastCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    estCostUsd: 0,
    cacheHitRatio: 0,
  };
  for (const c of window) {
    if (c.route === "llm") acc.llmCalls += 1;
    if (c.route === "fast") acc.fastCalls += 1;
    acc.inputTokens += c.inputTokens;
    acc.outputTokens += c.outputTokens;
    acc.cacheCreationInputTokens += c.cacheCreationInputTokens;
    acc.cacheReadInputTokens += c.cacheReadInputTokens;
    acc.estCostUsd += c.estCostUsd;
  }
  const totalCacheable = acc.cacheCreationInputTokens + acc.cacheReadInputTokens;
  acc.cacheHitRatio = totalCacheable > 0 ? acc.cacheReadInputTokens / totalCacheable : 0;
  acc.estCostUsd = Math.round(acc.estCostUsd * 1_000_000) / 1_000_000;
  return acc;
}

export function recent(limit = 50): ApiCallRecord[] {
  return calls.slice(-limit).reverse();
}

export function totals(): UsageSummary {
  return summarize(Number.MAX_SAFE_INTEGER);
}
