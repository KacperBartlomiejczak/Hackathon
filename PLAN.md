# InvestWatch — plan działania (sob 14:30 → niedz 10:30)

Deadline UKNF: **niedziela 22.11, 11:00**. Oddajemy o 10:30, żeby mieć bufor.

## Role
Szczegółowe plany per osoba (branch, zadania, brief dla agenta): **`docs/team/`**. Okna merge do `main`: 15:30, 17:30, 19:00, 21:00, 23:00, 01:00, 02:30, 03:45.

| # | Kto | Odpowiada za |
|---|---|---|
| 1 | **Kacper (lead)** | `collector/`: Playwright, BullMQ, harmonogram, rotacja UA i proxy, adaptery; integracja całości, decyzje |
| 2 | **Python #1 (ziomek)** | `ai/`: Ollama, prompty, moduły 2 i 3, scoring, alerty do api |
| 3 | Osoba #3 | `ai/`: preprocessing, dedup, embeddingi, M1 (dopasowanie firm), rejestr KNF → `entities`, gold set, `/eval` |
| 4 | Osoba #4 | `api/`: schemat DB, Drizzle, REST, Socket.io, statusy, eksport CSV/JSON |
| 5 | Osoba #5 | `web/`: lista + filtry, szczegóły findingu, wykres trendu, toasty alertów, panel kalibracji |
| 6 | Osoba #6 | `infra/`: compose, healthchecki, seed, skany bezpieczeństwa, README, `AI_PROCESS.md`, prezentacja, film |

Jeśli osoba #3 nie zna Pythona: robi rejestr KNF (CSV → seed `entities`), oznacza gold set i reguły M1 w YAML, a kod M1 pisze Python #1.

## Harmonogram
### 14:30–15:30 — Start (wszyscy)
- Repo, wrzucenie `CLAUDE.md`, `PLAN.md`, `docs/`, `.claude/skills/`.
- 15 min czytania `docs/contracts.md` przez wszystkich; ewentualne poprawki teraz, potem tylko przez `data-contract`.
- #6: szkielet `docker-compose.yml` (postgres+pgvector, valkey, seaweedfs, ollama) + init SQL z contracts.
- #2: **od razu `ollama pull`** modelu LLM i `bge-m3` (wifi na hali bywa wolne; najlepiej na hotspocie lub z własnego dysku).
- Ktoś idzie po dane na pendrivie do stoiska UKNF i **pyta mentorów o załącznik z wymogami informacji o ryzyku (M2)** oraz o to, czy dane próbne można trzymać w repo.

### 15:30–19:00 — Pionowy plaster (cel: 1 dokument przechodzi całą drogę)
- Kacper: adapter `sample` (dane z pendrive'a) + jeden adapter `web` + kolejka + zapis do DB/S3 (SeaweedFS) + wywołanie ai.
- #2: `/analyze` z M2 na prostym prompcie, zapis findingu.
- #3: trafilatura, hash i simhash, embedding, seed `entities` z rejestru KNF.
- #4: `GET /findings`, `GET /findings/:id`, Socket.io `alert:new`.
- #5: lista findingów + szczegóły (na mockach, potem na prawdziwym API).
- #6: compose wstaje jedną komendą, `.env.example`, pierwszy `npm audit` i `pip-audit`.
- **19:00 checkpoint (skill `demo-check`, pkt 1–2)**: dokument z próbki → finding → widać go w dashboardzie.

### 19:00–20:00 — Jedzenie + krótkie demo wewnętrzne

### 20:00–00:00 — Trzy moduły i realne źródła
- Kacper: adaptery social (Instagram/Facebook/TikTok — publiczne treści, best effort) + YouTube/strony finfluencerów; harmonogram co X godzin; rotacja UA i proxy.
- #2: M3 (shadow advisory) + dopracowanie M2 (checklista z załącznika, cytaty, walidacja cytatów).
- #3: M1 (firma z rejestru wspomniana przez kogoś spoza `official_domains`), anchor phrases, start oznaczania gold setu.
- #4: filtry, `/stats/trend`, `/stats/summary`, PATCH statusu + historia, `/export`.
- #5: filtry, wykres trendu (Recharts), toasty Socket.io, zmiana statusu.
- #6: healthchecki, seed `sources`, zaczyna szkielet prezentacji i `AI_PROCESS.md`.
- **00:00 checkpoint**: 3 moduły dają findingi, alert na żywo działa.

### 00:00–04:00 — Kalibracja i domknięcie
- #3 + #2: gold set (≥ 40/moduł), `/eval`, strojenie wag i progów, porównanie promptów przed/po (do prezentacji).
- #5: **panel kalibracji** (suwak → precision/recall/FP/FN + liczba wyników na liście).
- Kacper: stabilność crawla (retry, timeouty, błędy per źródło w `crawl_runs`), przycisk „Uruchom crawl” do demo.
- #4: `PUT /settings/modules/:m`, eksport.
- #6: skany bezpieczeństwa → `docs/SECURITY.md`, `docs/DEPENDENCIES.md` z licencjami.
- **04:00 FEATURE FREEZE** + pełny `demo-check`.

### 04:00–07:00 — Sen na zmiany
- Zawsze 2 osoby na nogach (bugfixy z listy z `demo-check`); reszta śpi. Zmiana o 05:30.
- Zero nowych funkcji.

### 07:00–09:30 — Pakowanie
- #6 + Kacper: README (Quick Start, wymagania sprzętowe, konfiguracja), prezentacja PDF, scenariusz demo.
- Film ≤ 3 min (nagrany na seedzie, który na pewno działa).
- Reszta: czyszczenie `console.log`/`print`, czysta konsola w przeglądarce, ostatnie skany.
- Próba demo na głos, z zegarkiem w ręku.

### 09:30–10:30 — Bufor i oddanie
- `demo-check` od zera na drugim laptopie.
- **Oddanie do 10:30.**

## Scenariusz demo (3–5 min)
1. `docker compose up` → dashboard pusty, źródła skonfigurowane.
2. „Uruchom crawl” → dokumenty wpadają na żywo.
3. Toast: wysokie ryzyko (M2: reklama „30% miesięcznie” bez ostrzeżenia) → szczegóły z cytatami i screenshotem.
4. M1: finfluencer reklamujący zarejestrowany dom maklerski → raport firma + reklamujący + URL.
5. M3: „family office” spoza rejestru oferujący „indywidualne rekomendacje” → flaga.
6. Panel kalibracji: przesuwamy próg → widać spadek FP i wzrost FN.
7. Status → confirmed, eksport CSV, wykres trendu.
8. 30 s o architekturze, bezpieczeństwie (skany, sekrety) i procesie AI (`CLAUDE.md` + skille + log).

## Plan B (gdy coś się sypie)
- Social media blokują → demo na adapterze `sample` + uczciwa informacja o ograniczeniach na slajdzie.
- LLM za wolny na laptopie → mniejszy model + krótszy kontekst; reguły i embeddingi dalej działają, LLM tylko dla kandydatów z wysokim score reguł.
- Brak załącznika z wymogami M2 → checklista na podstawie pytań do mentorów UKNF, oznaczona na slajdzie jako założenie.
