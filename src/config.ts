import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TZ: z.string().default("America/Los_Angeles"),

  PORT: z.coerce.number().int().positive().default(3000),

  MQTT_URL: z.string().default("mqtt://localhost:1883"),
  DATABASE_URL: z.string().default("postgresql://home_brain:home_brain@localhost:5432/home_brain?schema=public"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_DEFAULT: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_MODEL_HEAVY: z.string().default("claude-opus-4-7"),

  // Voice surfaces (Alexa, Siri shortcut, future) sign requests with this
  // shared secret. Required for POST /interpret; leave unset to disable.
  HB_HMAC_SECRET: z.string().optional(),
  HB_HMAC_MAX_SKEW_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  HB_VOICE_DEADLINE_MS: z.coerce.number().int().positive().default(6500),

  // Voice friction reduction.
  //   HB_VOICE_KEEP_OPEN — Alexa session stays open after a command so the user
  //                        can issue a follow-up without re-prefixing "ask natasha brain".
  //   HB_VOICE_TERSE     — collapse action confirmations to a 1-clause "OK." style so
  //                        the user can speak again faster. Query responses (no tool
  //                        calls) keep their full text either way.
  HB_VOICE_KEEP_OPEN: z.coerce.boolean().default(true),
  HB_VOICE_TERSE: z.coerce.boolean().default(true),

  // Claude API pricing (USD per million tokens). Used by /api-usage to estimate
  // cost; override if you switch tiers or to track exact billed prices.
  HB_PRICE_INPUT_PER_MTOK: z.coerce.number().nonnegative().default(3.0),
  HB_PRICE_OUTPUT_PER_MTOK: z.coerce.number().nonnegative().default(15.0),
  HB_PRICE_CACHE_WRITE_PER_MTOK: z.coerce.number().nonnegative().default(3.75),
  HB_PRICE_CACHE_READ_PER_MTOK: z.coerce.number().nonnegative().default(0.30),

  DISCOVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
