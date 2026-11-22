import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const RISK_LABEL = { low: "Niskie", medium: "Średnie", high: "Wysokie" } as const;
export const STATUS_LABEL = {
  new: "Nowy",
  in_review: "W analizie",
  confirmed: "Potwierdzony",
  dismissed: "Odrzucony",
} as const;
export const SOURCE_LABEL: Record<string, string> = {
  web: "Strona WWW",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  sample: "Dane przykładowe",
};

const CRITERION_LABEL: Record<string, string> = {
  promotes_firm: "Promowanie firmy",
  profit_promises: "Obietnice zysku",
  impersonation: "Podszywanie się pod firmę",
  risk_warning_present: "Ostrzeżenie o ryzyku",
  risk_prominence: "Widoczność ostrzeżenia o ryzyku",
  profit_risk_balance: "Proporcja zysku do ryzyka",
  no_guaranteed_returns: "Brak gwarancji zysku",
  past_performance_disclaimer: "Zastrzeżenie o wynikach historycznych",
  leverage_loss_warning: "Ostrzeżenie o stracie przy dźwigni",
  fair_clear_not_misleading: "Rzetelność i jasność przekazu",
  no_trivialization: "Brak bagatelizowania ryzyka",
  individual_recommendations: "Indywidualne rekomendacje",
  portfolio_management: "Zarządzanie portfelem",
  paid_advisory_offer: "Płatna oferta doradztwa",
};

const VERDICT_LABEL: Record<string, string> = {
  pass: "spełnione",
  fail: "niespełnione",
  unclear: "niejasne",
};

// M1 and M3 look for a violation: verdict "fail" means it was detected. Only M2 is a requirements checklist.
const DETECTION_VERDICT_LABEL: Record<string, string> = {
  pass: "nie wykryto",
  fail: "wykryto",
  unclear: "niejasne",
};

const lookup = (map: Record<string, string>, key: string): string => (Object.hasOwn(map, key) ? map[key] : key);

export const sourceLabel = (kind: string): string => lookup(SOURCE_LABEL, kind);
export const criterionLabel = (code: string): string => lookup(CRITERION_LABEL, code);
export const verdictLabel = (verdict: string, module?: 1 | 2 | 3): string =>
  lookup(module === 1 || module === 3 ? DETECTION_VERDICT_LABEL : VERDICT_LABEL, verdict);

export const MODULE_LABEL ={ 1: "M1 Finfluencerzy", 2: "M2 Informacja o ryzyku", 3: "M3 Shadow advisory" } as const;

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}
