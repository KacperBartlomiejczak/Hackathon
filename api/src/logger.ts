import { pino, type Logger, type LoggerOptions } from "pino";

export const REDACT_PATHS = [
  "req.headers.authorization",
  'req.headers["x-internal-token"]',
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.token",
  "*.password",
  "*.authorization",
];

export function buildLoggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  };
}

export function createLogger(level: string): Logger {
  return pino(buildLoggerOptions(level));
}
