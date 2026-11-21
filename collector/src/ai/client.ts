import { config } from '../config.js';
import { logger } from '../logger.js';

const MAX_ATTEMPTS = 3;
// ai worst case: LLM 2x60 s + embedding + S3; a shorter timeout makes us re-trigger a still-running analysis.
const TIMEOUT_MS = 300_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Triggers AI analysis of a document. Never throws; false = document stays `fetched`. */
export async function postAnalyze(
  documentId: number,
  baseUrl: string = config.AI_URL,
  backoffMs = 1000,
  timeoutMs = TIMEOUT_MS,
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
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      err = undefined;
      if (res.ok) {
        logger.info({ documentId, status, durationMs: Date.now() - started }, 'analyze triggered');
        return true;
      }
      // Only 503 (ai not ready) is retried; 502 = ai already marked the document failed.
      if (status !== 503) break;
    } catch (e) {
      status = undefined;
      err = e;
      // Timeout: ai may still be analysing; a retry would run the LLM twice on the same document.
      if (e instanceof Error && e.name === 'TimeoutError') break;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs * 2 ** (attempt - 1));
  }
  logger.warn({ documentId, status, attempts: attempt, err }, 'analyze failed');
  return false;
}
