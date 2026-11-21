import { mockFindingDetails, mockFindings } from "@/mocks";
import type { Finding, FindingDetails, FindingsFilters, Page } from "@/types";

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const USE_MOCKS: boolean = import.meta.env.VITE_USE_MOCKS !== "false";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchFindings(filters: FindingsFilters): Promise<Page<Finding>> {
  if (USE_MOCKS) {
    return { items: mockFindings, total: mockFindings.length, page: 1, pageSize: 20 };
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return get<Page<Finding>>(`/findings?${params.toString()}`);
}

export async function fetchFinding(id: number): Promise<FindingDetails> {
  if (USE_MOCKS) {
    const found = mockFindingDetails(id);
    if (!found) throw new Error("Nie znaleziono");
    return found;
  }
  return get<FindingDetails>(`/findings/${id}`);
}
