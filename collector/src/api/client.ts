import { config } from '../config.js';
import { logger } from '../logger.js';
import type { CrawlStatusPayload } from '../types/index.js';

/** Reports a crawl_run status to api (re-emitted as `crawl:status`). Never throws; api down must not stop a crawl. */
export async function postCrawlStatus(
  payload: CrawlStatusPayload,
  baseUrl: string = config.API_URL,
  token: string = config.INTERNAL_TOKEN,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/internal/crawl-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) return true;
    logger.warn({ crawlRunId: payload.crawlRunId, status: res.status }, 'crawl-status rejected');
  } catch (err) {
    logger.warn({ crawlRunId: payload.crawlRunId, err }, 'crawl-status failed');
  }
  return false;
}
