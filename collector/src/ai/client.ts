import { config } from '../config.js';
import { logger } from '../logger.js';

const MAX_ATTEMPTS = 3;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Triggers AI analysis of a document. Never throws; false = document stays `fetched`. */
export async function postAnalyze(
  documentId: number,
  baseUrl: string = config.AI_URL,
  backoffMs = 1000,
): Promise<boolean> {
  const started = Date.now();
  let status: number | undefined;
  let err: unknown;
  let attempt = 0;
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    try {
      const res = await fetch(`${baseUrl}/analyze/${documentId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(60_000),
      });
      status = res.status;
      err = undefined;
      if (res.ok) {
        logger.info({ documentId, status, durationMs: Date.now() - started }, 'analyze triggered');
        return true;
      }
      // 501 (not implemented) and 4xx are final; other 5xx are retried
      if (status < 500 || status === 501) break;
    } catch (e) {
      status = undefined;
      err = e;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs * 2 ** (attempt - 1));
  }
  logger.warn({ documentId, status, attempts: attempt, err }, 'analyze failed');
  return false;
}
