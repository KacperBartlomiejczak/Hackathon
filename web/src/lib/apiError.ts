export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(`API ${status}${code ? ` ${code}` : ""}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function toApiError(res: Response): Promise<ApiError> {
  let code: string | null = null;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") code = body.error;
  } catch {
    code = null;
  }
  return new ApiError(res.status, code);
}

const STATUS_MESSAGES: Record<string, string> = {
  invalid_transition: "Taka zmiana statusu jest niedozwolona. Dozwolone przejścia: nowy → w analizie → potwierdzony lub odrzucony.",
  ai_unavailable: "Moduł AI jest niedostępny. Spróbuj ponownie za chwilę.",
  queue_unavailable: "Kolejka zadań jest niedostępna. Crawl nie został uruchomiony.",
  not_found: "Nie znaleziono zasobu.",
};

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (err.code && STATUS_MESSAGES[err.code]) return STATUS_MESSAGES[err.code];
  if (err.status === 501) return "Ta funkcja nie jest jeszcze zaimplementowana po stronie serwera.";
  if (err.status === 404) return STATUS_MESSAGES.not_found;
  if (err.status === 409) return STATUS_MESSAGES.invalid_transition;
  if (err.status === 502) return STATUS_MESSAGES.ai_unavailable;
  if (err.status === 503) return STATUS_MESSAGES.queue_unavailable;
  return fallback;
}
