import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';

const sourcesSchema = z.object({
  sources: z.array(
    z.object({
      kind: z.enum(['web', 'facebook', 'instagram', 'tiktok', 'youtube', 'sample']),
      name: z.string(),
      start_url: z.string().optional(),
      module_hint: z.number().int().min(1).max(3).nullable().default(null),
      enabled: z.boolean().default(true),
      cron: z.string().nullable().default(null),
    }),
  ),
});

const { sources } = sourcesSchema.parse(parse(await readFile(config.SOURCES_FILE, 'utf8')));
logger.info({ sources: sources.length }, 'collector started');
// TODO(hack): upsert sources to DB, start BullMQ workers + scheduler
