import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  VALKEY_URL: z.string().default('redis://valkey:6379'),
  AI_URL: z.string().default('http://ai:8000'),
  S3_ENDPOINT: z.string().default('http://seaweedfs:8333'),
  DATA_DIR: z.string().default('/data'),
  PROXY_LIST: z.string().default(''),
  SOURCES_FILE: z.string().default('sources.yaml'),
});

export const config = schema.parse(process.env);
