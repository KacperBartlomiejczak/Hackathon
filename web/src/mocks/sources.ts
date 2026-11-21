import type { CrawlRunInfo, Source } from "@/types";

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

function run(status: CrawlRunInfo["status"], minutesAgo: number, itemsFound: number | null, error: string | null = null): CrawlRunInfo {
  return {
    status,
    startedAt: ago(minutesAgo + 3),
    finishedAt: status === "running" ? null : ago(minutesAgo),
    itemsFound,
    error,
  };
}

export const mockSources: Source[] = [
  { id: 1, kind: "web", name: "Portale inwestycyjne (RSS + strony)", startUrl: "https://example.pl/inwestycje", moduleHint: 2, enabled: true, cron: "0 */6 * * *", lastRun: run("ok", 42, 128) },
  { id: 2, kind: "instagram", name: "Instagram – #inwestowanie", startUrl: "https://www.instagram.com/explore/tags/inwestowanie/", moduleHint: 1, enabled: true, cron: "0 */4 * * *", lastRun: run("partial", 95, 37, "Limit zapytań – pobrano część postów") },
  { id: 3, kind: "facebook", name: "Facebook – grupy giełdowe", startUrl: "https://www.facebook.com/groups/gielda-pl", moduleHint: 3, enabled: true, cron: "0 */8 * * *", lastRun: run("failed", 180, 0, "HTTP 403: wymagane logowanie, sesja wygasła") },
  { id: 4, kind: "tiktok", name: "TikTok – finfluencerzy", startUrl: "https://www.tiktok.com/tag/finanse", moduleHint: 1, enabled: true, cron: "0 3 * * *", lastRun: run("ok", 300, 64) },
  { id: 5, kind: "youtube", name: "YouTube – kanały o inwestowaniu", startUrl: "https://www.youtube.com/results?search_query=inwestowanie", moduleHint: null, enabled: false, cron: null, lastRun: run("ok", 600, 211) },
  { id: 6, kind: "sample", name: "Dane przykładowe UKNF", startUrl: "file:///data/uknf-sample", moduleHint: null, enabled: true, cron: null, lastRun: null },
];
