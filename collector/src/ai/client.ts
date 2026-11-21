import { config } from '../config.js';
import { logger } from '../logger.js';

const MAX_ATTEMPTS = 3;
// A shorter timeout makes us give up on an analysis the ai still runs; tune via AI_ANALYZE_TIMEOUT_MS.
const TIMEOUT_MS = config.AI_ANALYZE_TIMEOUT_MS;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// In-process semaphore: crawl-item jobs fire analyses without awaiting them, so without it N documents = N parallel LLM runs.
// shortcut: queue is lost on restart (documents stay `fetched`); move to a BullMQ queue if that matters.
let running = 0;
const inFlight = new Set<number>();
const waiting: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (running < config.ANALYZE_CONCURRENCY) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve)); // slot is handed over by release()
}
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/** Triggers AI analysis of a document. Never throws; false = document stays `fetched`. */
export async function postAnalyze(documentId: number, baseUrl: string = config.AI_URL, backoffMs = 1000, timeoutMs = TIMEOUT_MS): Promise<boolean> {
  // Same document already queued/running (e.g. overlapping re-crawl): a second run would double the LLM work.
  if (inFlight.has(documentId)) return true;
  inFlight.add(documentId);
  await acquire();
  try {
    return await analyze(documentId, baseUrl, backoffMs, timeoutMs);
  } finally {
    inFlight.delete(documentId);
    release();
  }
}

async function analyze(documentId: number, baseUrl: string, backoffMs: number, timeoutMs: number): Promise<boolean> {
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
