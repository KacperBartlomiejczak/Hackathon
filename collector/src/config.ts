import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  VALKEY_URL: z.string().default('redis://valkey:6379'),
  AI_URL: z.string().default('http://ai:8000'),
  API_URL: z.string().default('http://api:3000'),
  INTERNAL_TOKEN: z.string().default(''),
  S3_ENDPOINT: z.string().default('http://seaweedfs:8333'),
  S3_BUCKET: z.string().default('investwatch'),
  S3_REGION: z.string().default('eu-central-1'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  DATA_DIR: z.string().default('/data'),
  PROXY_LIST: z.string().default(''),
  SOURCES_FILE: z.string().default('sources.yaml'),
  // Queue one crawl per enabled source at startup (demo trigger until POST /sources/:id/run exists).
  CRAWL_ON_START: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export const config = schema.parse(process.env);
