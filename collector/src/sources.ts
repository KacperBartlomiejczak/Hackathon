import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from './db/client.js';
import { sources } from './db/schema.js';
import { logger } from './logger.js';

export const sourcesFileSchema = z.object({
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

export type SourceEntry = z.infer<typeof sourcesFileSchema>['sources'][number];

/**
 * Upserts sources.yaml into `sources`, keyed by (kind, name).
 * shortcut: no UNIQUE(kind, name) in the schema, so select-then-write; fine for one collector instance.
 */
export async function syncSources(
  db: Db,
  entries: SourceEntry[],
): Promise<{ id: number; enabled: boolean; cron: string | null }[]> {
  const out: { id: number; enabled: boolean; cron: string | null }[] = [];
  for (const e of entries) {
    const values = {
      kind: e.kind,
      name: e.name,
      startUrl: e.start_url ?? null,
      moduleHint: e.module_hint,
      enabled: e.enabled,
      cron: e.cron,
    };
    const [existing] = await db
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.kind, e.kind), eq(sources.name, e.name)));
    let id: number;
    if (existing) {
      await db.update(sources).set(values).where(eq(sources.id, existing.id));
      id = existing.id;
    } else {
      const [row] = await db.insert(sources).values(values).returning({ id: sources.id });
      if (!row) throw new Error(`sources insert returned nothing for ${e.kind}/${e.name}`);
      id = row.id;
    }
    out.push({ id, enabled: e.enabled, cron: e.cron });
  }
  logger.info({ synced: out.length }, 'sources synced');
  return out;
}
