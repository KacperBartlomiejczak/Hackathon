# Bezpieczeństwo

## Skany zależności (2026-11-21)

| Serwis | Polecenie | Wynik |
|---|---|---|
| api | `npm audit --audit-level=high` | 0 podatności |
| collector | `npm audit --audit-level=high` | 0 podatności |
| web | `npm audit --audit-level=high` | 0 podatności |
| ai | `uvx pip-audit` na `uv export --no-dev` | brak znanych podatności |

Szczegóły: `ai/SECURITY.md`, `web/SECURITY.md`. Lista paczek i licencji: `<serwis>/DEPENDENCIES.md`.

## Obrazy i licencje

Wszystkie obrazy mają przypięte wersje (bez `latest`). Infrastruktura na licencjach otwartych:
PostgreSQL + pgvector, Valkey (BSD), SeaweedFS (Apache-2.0), Ollama (MIT). Celowo bez Redisa 7.4+ (RSAL/SSPL) i MinIO (AGPL).

## Sekrety

- W repo jest tylko `.env.example` z wartościami dev; `.env` jest w `.gitignore`.
- `api` waliduje konfigurację przez `zod` (np. `INTERNAL_TOKEN` min. 16 znaków) i nie startuje z brakami.
- `POST /internal/alerts` wymaga nagłówka `X-Internal-Token`.

## Treść ze stron

Pobrana treść to dane, nie instrukcje: prompty rozdzielają instrukcję systemową od treści (ochrona przed prompt injection).

## Znane ograniczenia

Postgres, Valkey i Ollama są wystawione na porty hosta dla wygody demo. Na produkcji zostaw tylko `web` i `api`.
