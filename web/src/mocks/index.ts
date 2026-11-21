import type { Entity, Finding, FindingDetails, FindingStatus, ModuleId, RiskLevel, SourceKind, StatusHistoryEntry } from "@/types";

const firms: Entity[] = [
  { id: 4, name: "XYZ Dom Maklerski S.A.", type: "investment_firm", isAuthorized: true },
  { id: 5, name: "Alfa Invest S.A.", type: "investment_firm", isAuthorized: true },
  { id: 6, name: "Beta Capital TFI", type: "investment_firm", isAuthorized: true },
];
const advertisers: Entity[] = [
  { id: 9, name: "@finfluencer_xyz", type: "finfluencer", isAuthorized: false },
  { id: 10, name: "@inwestuj_z_jackiem", type: "finfluencer", isAuthorized: false },
  { id: 11, name: "Family Office Pro", type: "advisory_unlicensed", isAuthorized: false },
];

const sources: SourceKind[] = ["web", "instagram", "facebook", "tiktok", "youtube", "sample"];
const risks: RiskLevel[] = ["high", "medium", "low"];
const statuses: FindingStatus[] = ["new", "in_review", "confirmed", "dismissed"];

const quotes: Record<ModuleId, { label: string; criterion: string; quote: string }[]> = {
  1: [
    { label: "third_party_promotion", criterion: "registered_firm_mentioned", quote: "Polecam XYZ Dom Maklerski, link w bio" },
    { label: "third_party_promotion", criterion: "advertiser_not_official", quote: "Otwórz konto przez mój link i zgarnij bonus" },
  ],
  2: [
    { label: "risk_info_insufficient", criterion: "risk_warning_present", quote: "Zarabiaj nawet 30% miesięcznie!" },
    { label: "risk_info_insufficient", criterion: "risk_prominence", quote: "Inwestowanie wiąże się z ryzykiem (drobny druk)" },
  ],
  3: [
    { label: "shadow_advisory", criterion: "individual_recommendation", quote: "Indywidualne rekomendacje dla Twojego portfela" },
    { label: "shadow_advisory", criterion: "portfolio_management", quote: "Zarządzamy Twoimi środkami, gwarantujemy stały zysk" },
  ],
};

function build(i: number): Finding {
  const id = i + 1;
  const module = ((i % 3) + 1) as ModuleId;
  const riskLevel = risks[Math.floor(i / 3) % 3];
  const score = riskLevel === "high" ? 0.9 - (i % 5) * 0.01 : riskLevel === "medium" ? 0.7 - (i % 4) * 0.01 : 0.4;
  const sourceKind = sources[i % sources.length];
  const set = quotes[module];
  const firm = module === 3 ? null : firms[i % firms.length];
  const advertiser = module === 1 ? advertisers[i % 2] : module === 3 ? advertisers[2] : null;
  const date = new Date(Date.UTC(2026, 10, 21, 8 + (i % 14), (i * 7) % 60));
  date.setUTCDate(date.getUTCDate() - Math.floor(i / 8));
  const iso = date.toISOString();
  const text = set.map((s) => s.quote).join(" ") + " Zapraszamy do kontaktu.";
  return {
    id,
    documentId: 800 + id,
    module,
    score,
    riskLevel,
    label: set[0].label,
    reasons: set.map((s, n) => ({ criterion: s.criterion, verdict: "fail", quote: s.quote, weight: n === 0 ? 0.4 : 0.3 })),
    firmEntityId: firm?.id ?? null,
    advertiserEntityId: advertiser?.id ?? null,
    firm,
    advertiser,
    model: "bielik-11b-q4",
    promptVersion: `m${module}-v3`,
    status: statuses[i % 4],
    createdAt: iso,
    document: {
      id: 800 + id,
      url: `https://example.pl/materialy/${id}`,
      sourceKind,
      fetchedAt: iso,
      publishedAt: null,
      authorHandle: advertiser?.name ?? null,
      title: `Materiał ${id}`,
      screenshotUrl: null,
      textClean: text,
    },
  };
}

export const mockFindings: Finding[] = Array.from({ length: 37 }, (_, i) => build(i)).sort(
  (a, b) => b.createdAt.localeCompare(a.createdAt),
);

export const mockHistory = new Map<number, StatusHistoryEntry[]>();

export const mockFindingDetails = (id: number): FindingDetails | undefined => {
  const f = mockFindings.find((x) => x.id === id);
  return f ? { ...f, history: mockHistory.get(id) ?? [] } : undefined;
};
