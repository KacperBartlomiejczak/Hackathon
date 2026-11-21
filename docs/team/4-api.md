# 4 · Osoba #4 — API + baza + kontrakty

**Branch:** `team/api` (stały, nie zmieniasz)
**Odpowiadasz za:** `api/` (Fastify, Drizzle, zod, Socket.io), `infra/db/` (init SQL, migracje), **`docs/contracts.md` — jesteś jedyną osobą, która go zmienia**.
**Nie dotykasz:** reszty repo.
**Dajesz innym:** schemat DB (wszyscy, **15:30 — blokuje cały zespół**), REST dla web, Socket.io (`alert:new`, `finding:updated`, `crawl:status`), `/internal/alerts` dla ai, `/sources/:id/run` dla demo.
**Czekasz na:** compose od #6 (15:30).

## Zadania
### 14:30–15:30 — najpilniejsze w zespole
- [ ] `infra/db/001_init.sql` dokładnie z `docs/contracts.md` + pgvector.
- [ ] Poprawki kontraktu zgłoszone przez zespół w pierwszych 15 min — potem tylko przez skill `data-contract`.
- [ ] Szkielet `api/` (TS strict, Fastify, pino, Drizzle schema, Dockerfile, `/health`).
**DoD 15:30:** PR z init SQL zmergowany jako pierwszy; `docker compose up` tworzy tabele.

### 15:30–19:00
- [ ] `GET /findings` (filtry + paginacja), `GET /findings/:id` (z dokumentem, cytatami, URL screenshota przez presigned S3).
- [ ] Socket.io + `POST /internal/alerts` (nagłówek `X-Internal-Token`) → emit `alert:new`.
**DoD 19:00:** web pokazuje prawdziwe findingi z API.

### 20:00–00:00
- [ ] `PATCH /findings/:id/status` + historia + emit `finding:updated`.
- [ ] `/stats/trend`, `/stats/summary`.
- [ ] `/settings/modules/:m` (GET/PUT), `/eval` (proxy do ai).
- [ ] `POST /sources/:id/run` (dodaje job do kolejki BullMQ collectora), emit `crawl:status`.

### 00:00–04:00
- [ ] `/export?format=csv|json` z filtrami — raport dla modułów 1/2/3 (firma, reklamujący, treść, URL).
- [ ] Walidacja zod na każdym wejściu, rate limit, CORS tylko na web, `npm audit`.

### 07:00–10:30
- [ ] Sekcja API w README (lista endpointów), `api/DEPENDENCIES.md`, `api/SECURITY.md`.

## Twój agent (Claude Code)
**Rola:** generuje endpointy, schemat Drizzle, walidację zod, obsługę Socket.io, eksport CSV. Skille: `data-contract`, `dependency-guard`, `demo-check`.
**Ty decydujesz i sprawdzasz:** każdą zmianę kontraktu (to Ty jesteś „sędzią” schematu), indeksy, zapytania filtrów na prawdziwych danych, bezpieczeństwo `/internal/*`.

Prompt startowy:
```
Jesteś agentem brancha team/api. Przeczytaj CLAUDE.md, docs/team/4-api.md i docs/contracts.md.
Pracujesz tylko w: api/, infra/db/, docs/contracts.md. Nie zmieniaj brancha.
Kontrakt zmieniaj wyłącznie skillem data-contract i zawsze dopisz w opisie PR, kto musi zaktualizować swoje typy.
Zadanie: <wklej>. Bez console.log — pino. Wejście walidowane zod.
Na koniec: commit, wpis do docs/ai-log/api.md, co sprawdzić ręcznie.
```
