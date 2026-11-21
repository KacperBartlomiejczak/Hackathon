import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  VALKEY_URL: z.string().default('redis://valkey:6379'),
  AI_URL: z.string().default('http://ai:8000'),
  API_URL: z.string().default('http://api:3000'),
  // One Bielik on a laptop; analyses beyond this wait in the collector (see ai/client.ts).
  ANALYZE_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  // Must stay above the ai per-document time budget (issue #41), else the ai keeps working after we gave up.
  AI_ANALYZE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(300_000),
  INTERNAL_TOKEN: z.string().default(''),
  S3_ENDPOINT: z.string().default('http://seaweedfs:8333'),
  S3_BUCKET: z.string().default('investwatch'),
  S3_REGION: z.string().default('eu-central-1'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  DATA_DIR: z.string().default('/data'),
  // Comma-separated proxy URLs (http/https/socks5); empty = no proxy.
  PROXY_LIST: z
    .string()
    .default('')
    .refine(
      (v) =>
        v
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .every((p) => URL.canParse(p) && /^(https?|socks5):$/.test(new URL(p).protocol)),
      { message: 'PROXY_LIST: each entry must be an http(s):// or socks5:// URL' },
    ),
  SOURCES_FILE: z.string().default('sources.yaml'),
  // Queue one crawl per enabled source at startup (demo trigger until POST /sources/:id/run exists).
  CRAWL_ON_START: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export const config = schema.parse(process.env);
