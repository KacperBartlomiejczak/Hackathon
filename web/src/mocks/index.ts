import type { Finding, FindingDetails } from "@/types";

const firm = { id: 4, name: "XYZ Dom Maklerski S.A.", type: "investment_firm", isAuthorized: true } as const;
const influencer = { id: 9, name: "@finfluencer_xyz", type: "finfluencer", isAuthorized: false } as const;

export const mockFindings: Finding[] = [
  {
    id: 1,
    documentId: 812,
    module: 2,
    score: 0.83,
    riskLevel: "high",
    label: "risk_info_insufficient",
    reasons: [
      { criterion: "risk_warning_present", verdict: "fail", quote: "Zarabiaj nawet 30% miesięcznie!", weight: 0.4 },
      { criterion: "risk_prominence", verdict: "fail", quote: "Inwestowanie wiąże się z ryzykiem (drobny druk)", weight: 0.3 },
    ],
    firmEntityId: 4,
    advertiserEntityId: null,
    firm,
    advertiser: null,
    model: "bielik-11b-q4",
    promptVersion: "m2-v3",
    status: "new",
    createdAt: "2026-11-21T18:30:00Z",
    document: {
      id: 812,
      url: "https://example.pl/oferta",
      sourceKind: "web",
      fetchedAt: "2026-11-21T18:02:11Z",
      publishedAt: null,
      authorHandle: null,
      title: "Oferta inwestycyjna",
      screenshotUrl: null,
      textClean: "Zarabiaj nawet 30% miesięcznie! Dołącz już dziś.",
    },
  },
  {
    id: 2,
    documentId: 813,
    module: 1,
    score: 0.71,
    riskLevel: "medium",
    label: "third_party_promotion",
    reasons: [{ criterion: "registered_firm_mentioned", verdict: "fail", quote: "Polecam XYZ Dom Maklerski, link w bio", weight: 0.5 }],
    firmEntityId: 4,
    advertiserEntityId: 9,
    firm,
    advertiser: influencer,
    model: "bielik-11b-q4",
    promptVersion: "m1-v1",
    status: "in_review",
    createdAt: "2026-11-21T19:10:00Z",
    document: {
      id: 813,
      url: "https://instagram.com/p/abc",
      sourceKind: "instagram",
      fetchedAt: "2026-11-21T19:00:00Z",
      publishedAt: "2026-11-21T12:00:00Z",
      authorHandle: "@finfluencer_xyz",
      title: null,
      screenshotUrl: null,
      textClean: "Polecam XYZ Dom Maklerski, link w bio",
    },
  },
];

export const mockFindingDetails = (id: number): FindingDetails | undefined => {
  const f = mockFindings.find((x) => x.id === id);
  return f ? { ...f, history: [] } : undefined;
};
