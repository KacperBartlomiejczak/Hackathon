# api — bezpieczeństwo

## Skany zależności

### 2026-11-21 — hardening (krok 24)
`npm audit --audit-level=high` (npm 11.20.0, `package-lock.json`)
Wynik: **found 0 vulnerabilities**. Zależności: 129 prod i 122 dev, razem 260 z opcjonalnymi.
Zero we wszystkich poziomach: info, low, moderate, high i critical. `npm audit --omit=dev` daje też 0.

## Zabezpieczenia w kodzie

| Obszar | Co jest | Gdzie |
|---|---|---|
| Walidacja wejścia | Każdy parametr, query i body przechodzi przez `zod`. Błąd daje `400 {error:"bad_request", message, issues[]}`. | `src/types/*.ts` |
| Format błędów | Każda odpowiedź błędu ma postać `{ error, message }`, bez stack trace'ów i komunikatów sterownika DB. Kody: `bad_request`, `unauthorized`, `not_found`, `conflict`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, `internal`. Nieznana trasa też daje `404 {error:"not_found"}`. Szczegóły 5xx trafiają tylko do logu pino. | `src/app.ts` |
| Rate limit | Globalnie 300 żądań/min na IP. `GET /export` ma 10/min, bo buduje do 10 000 wierszy w pamięci. `/internal/*` i `/health` są bez limitu (ruch serwis–serwis i healthcheck). Przekroczenie daje `429 {error:"rate_limited"}` z `Retry-After`. | `src/app.ts`, `src/routes/export.ts` |
| CORS | Tylko `WEB_ORIGIN`, z `.env`. Przeglądarka widzi wyłącznie nagłówki `Content-Disposition` i `X-Export-Truncated`. Socket.io ma ten sam origin. | `src/app.ts`, `src/realtime/socket.ts` |
| `/internal/*` | Wymaga nagłówka `X-Internal-Token` (min. 16 znaków, inaczej serwis nie wstaje). Porównanie przez `timingSafeEqual` na SHA-256 obu stron. | `src/routes/internal.ts` |
| Eksport CSV | Komórki zaczynające się od `=`, `+`, `-`, `@`, TAB albo CR dostają prefiks `'` (ochrona przed formula injection). W kolumnach z handle'em zdejmujemy wiodące `@`. | `src/routes/export.ts` |
| SQL | Tylko zapytania parametryzowane przez Drizzle. `q` ma escapowane `%` i `_`, a `bucket` przechodzi przez allowlistę (`day`, `hour`). | `src/routes/*.ts` |
| Logi | Nagłówki `authorization`, `x-internal-token`, `cookie` i `set-cookie` oraz pola `*.token` i `*.password` są zamieniane na `[REDACTED]`. W kodzie nie ma `console.*` (ESLint `no-console`). | `src/logger.ts` |
| Screenshoty | Presigned URL ważny 15 min, podpisany pod `S3_PUBLIC_ENDPOINT`. | `src/storage/s3.ts` |
| Obraz Dockera | Przypięty `node:22.23.5-bookworm-slim`, build multi-stage. Działa jako user `node`, nie root. | `Dockerfile` |

## Znane ograniczenia (poza `api/`)
- **SeaweedFS bez autoryzacji S3.** Compose uruchamia `-s3` bez `-s3.config`, więc SeaweedFS nie sprawdza podpisu. Sprawdzone 2026-11-21: zmieniony podpis i GET bez podpisu też dają `200`. Ważność 15 min jest więc tylko umowna, a każdy, kto ma dostęp do portu 8333, czyta bucket. Właściciel to infra: konfiguracja `-s3.config` z kluczami. Szczegóły w issue #15.
- **`GET /eval`** przekazuje status i body z ai 1:1 (np. `501 {detail}` z FastAPI), więc tylko ten endpoint nie ma formatu `{ error, message }`. Tak jest w kontrakcie.
