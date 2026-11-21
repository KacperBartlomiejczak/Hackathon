import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  INTERNAL_TOKEN: z.string().min(16),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must be a postgres:// URL"),
  S3_ENDPOINT: z.string().url(),
  // Host used to sign URLs handed to the browser (may differ from S3_ENDPOINT inside docker).
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  // Base URL of the ai service; routes append their own path (e.g. /eval).
  AI_URL: z.string().url().default("http://ai:8000"),
  EVAL_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  VALKEY_URL: z
    .string()
    .url()
    .refine((v) => /^rediss?:\/\//.test(v), "VALKEY_URL must be a redis:// URL")
    .default("redis://valkey:6379"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // REDIS_URL accepted as a fallback name for VALKEY_URL.
  return schema.parse({ ...env, VALKEY_URL: env.VALKEY_URL ?? env.REDIS_URL });
}
