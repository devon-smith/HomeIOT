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

  DISCOVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
