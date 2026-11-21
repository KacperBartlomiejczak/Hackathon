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
export const MODULE_LABEL = { 1: "M1 Finfluencerzy", 2: "M2 Informacja o ryzyku", 3: "M3 Shadow advisory" } as const;

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}
