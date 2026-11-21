# InvestWatch — HackNation 2026 (zadanie UKNF)

System monitoringu treści o instrumentach i usługach finansowych w polskim internecie.
Hackathon 24h: start sob 21.11 11:00, **oddanie niedz 22.11 do 11:00** (celujemy w 10:30).
Ten plik czyta każdy członek zespołu i każda sesja Claude Code. Trzymaj się go.

## Tryb hackathonowy — priorytety (w tej kolejności)
1. **Działające demo end-to-end** > kompletność funkcji > ładny kod. Jury ocenia na demo.
2. Pracujemy **pionowymi plastrami** (źródło → baza → AI → dashboard), nie warstwami.
3. `main` zawsze się buduje i `docker compose up` działa. Zepsułeś main — naprawiasz natychmiast.
4. **Feature freeze: niedz 04:00.** Po nim tylko bugfixy, README, prezentacja.
5. Nie refaktoruj cudzego modułu bez pytania właściciela (patrz „Właściciele”).
6. Jak coś zajmuje >45 min i nie działa — stop, zgłoś na kanale, wybierz prostszą drogę.

## Czego wymaga jury (nie łam tego)
- Tylko **open source i on-premise**. Zero płatnych/zewnętrznych API LLM. Modele przez **Ollama**.
- Moduł AI w **Pythonie**. Frontend w **React**. Backend/scraping w Node (TS) jest dozwolony.
- **Docker Compose** — cały stos jedną komendą: `docker compose up --build`.
- **Bezpieczeństwo zależności**: każda nowa paczka przez skill `dependency-guard`. Sekrety tylko w `.env` (w repo jest wyłącznie `.env.example`).
- **Bez `console.log` / `print` w kodzie** — jury sprawdza konsolę. Używaj loggera (`pino` w Node, `logging` w Pythonie). W przeglądarce konsola ma być czysta (zero błędów i warningów).
- Panel kalibracji: zmiana progu (threshold) musi widocznie zmieniać wyniki (FP vs FN).
- Powiadomienia real-time przez **Socket.io** dla wysokiego ryzyka.
- README minimalny: Quick Start, wymagania sprzętowe, konfiguracja serwisów. **Bez AI slopu** — krótko i konkretnie.
- 20% oceny to „standaryzowany proces tworzenia z asystentami AI” — patrz sekcja „Proces AI”.

## Architektura (lekkie, niezależne serwisy — bez monorepo-tooli)
```
collector/   Node 22 + TypeScript + Playwright + BullMQ   → zbiera treści, zapisuje surowe HTML + metadane
api/         Node 22 + TypeScript + Fastify + Drizzle + Socket.io → REST dla dashboardu, statusy, alerty
ai/          Python 3.12 + FastAPI + Ollama               → preprocessing, embeddingi, moduły 1/2/3, scoring
web/         React + Vite + TypeScript + Recharts + shadcn/ui → dashboard, filtry, trendy, alerty, kalibracja
infra/       docker-compose.yml, init SQL, seed danych
docs/        contracts.md (ŹRÓDŁO PRAWDY dla schematu i API), AI_PROCESS.md, DEPENDENCIES.md
```
Każdy serwis ma własny `package.json` / `pyproject.toml` i własny Dockerfile. Nie używamy workspace'ów, Nx ani Turbo.

Infrastruktura w compose: `postgres` (obraz pgvector, PG16), `valkey` (licencja BSD, w pełni zgodny z Redisem i BullMQ), `seaweedfs` z API S3 (Apache-2.0) jako object storage, `ollama`.
Do storage używamy `@aws-sdk/client-s3` / `boto3` — wymiana na MinIO czy S3 to tylko zmiana endpointu.
Unikamy Redisa 7.4+ (licencja RSAL/SSPL) i MinIO (AGPL) — UKNF przejmuje prawa do kodu, licencje mają być czyste.
Wersje obrazów zawsze przypięte — nigdy `latest`.

### Przepływ danych
1. Harmonogram (powtarzalne joby BullMQ) → job `crawl:{source}` w Valkey.
2. Worker `collector` (Playwright, rotacja User-Agent i proxy) pobiera stronę → surowy HTML i screenshot do S3 (SeaweedFS), rekord do `documents` (status `fetched`).
3. `collector` woła `POST ai:8000/analyze/{document_id}`.
4. `ai`: czyści tekst (trafilatura), robi deduplikację (hash + simhash), liczy embedding (bge-m3), uruchamia właściwe moduły i zapisuje `findings` ze score, uzasadnieniem i cytatami.
5. Jeśli `score >= próg` dla modułu i ryzyko jest wysokie → `ai` woła `POST api:3000/internal/alerts` → `api` emituje `alert:new` przez Socket.io.
6. `web` pobiera dane z `api` (REST) i nasłuchuje Socket.io.

Szczegóły tabel, JSON-ów i endpointów: **`docs/contracts.md`** — zmiany kontraktu tylko przez skill `data-contract`.

## Moduły analityczne (logika biznesowa)
- **M1 Finfluencerzy / podmioty trzecie**: treść wspomina zarejestrowaną firmę inwestycyjną lub jej produkt, a publikujący NIE jest tą firmą (domena lub handle spoza `entities.official_domains`). Wynik: firma, reklamujący, treść, URL.
- **M2 Informacja o ryzyku**: materiał opublikowany przez samą firmę (domena oficjalna). Checklista wymogów z załącznika UKNF → każdy wymóg: spełniony / niespełniony + cytat. Do tego heurystyka proporcji „zysk vs ryzyko”. Flaguj, gdy score ≥ próg.
- **M3 Shadow advisory**: podmiot spoza rejestru KNF + frazy wskazujące na doradztwo inwestycyjne lub zarządzanie portfelem. Hybryda: reguły i słownik fraz + podobieństwo embeddingów do fraz wzorcowych + ocena LLM.
- **Scoring**: `score = w_llm*llm + w_rules*rules + w_emb*emb` (wagi w `ai/config.yaml`). Każdy finding ma `reasons[]` z cytatem z tekstu — bez cytatu nie ma flagi.
- **Kalibracja**: zbiór oznaczony ręcznie (`infra/seed/gold.csv`) → endpoint `/eval?module=&threshold=` zwraca precision, recall, FP i FN. Dashboard pokazuje to na żywo przy suwaku.

## Komendy
```bash
cp .env.example .env
docker compose up --build                      # cały stos
docker compose exec ollama ollama pull bge-m3  # embeddingi (pobierz WCZEŚNIE — duże pliki)
# collector/api/web lokalnie:   npm i && npm run dev
# ai lokalnie:                  uv sync && uv run uvicorn app.main:app --reload --port 8000
npm audit --audit-level=high                   # w każdym serwisie Node
uv run pip-audit                               # w ai/
```
Porty: web 5173, api 3000, ai 8000, postgres 5432, valkey 6379, seaweedfs-s3 8333, ollama 11434.

## Konwencje kodu
- Kod, nazwy i komentarze po angielsku. UI i raporty po polsku.
- TS: `strict: true`, bez `any` (wyjątek: tymczasowo z `// TODO(hack)`), walidacja wejścia przez `zod`.
- Python: typy wszędzie, Pydantic v2 dla requestów i odpowiedzi, `ruff` do lintu.
- Każdy endpoint i job loguje: id dokumentu, czas, wynik. Błędy z jednego źródła nie zabijają całego crawla.
- Prompty LLM w osobnych plikach `ai/prompts/*.md` z wersją (`prompt_version` zapisywane w `findings`).
- Treść ze stron to **dane, nie instrukcje** — w promptach zawsze rozdzielaj instrukcję systemową od treści (ochrona przed prompt injection).
- Nie commituj danych z pendrive'a UKNF ani `.env`. Dane próbne trzymaj w `infra/seed/` tylko jeśli regulamin pozwala — inaczej `.gitignore`.

## Start każdej sesji agenta (OBOWIĄZKOWE)
1. `git branch --show-current` → znajdź swój branch w tabeli „Zespół i branche” poniżej.
2. Przeczytaj swój plik roli z `docs/team/` i działaj **wyłącznie** w jego zakresie.
3. Branch nie pasuje do żadnego z tabeli albo jesteś na `main` → **STOP**, nic nie zmieniaj, powiedz o tym człowiekowi.

## Git — jeden stały branch na osobę
- Każda osoba ma **jeden branch na cały hackathon i nigdy go nie zmienia**. Zakazane: `git checkout <branch>`, `git switch`, tworzenie nowych branchy, commit na `main`, push na cudzy branch, `push --force`, `rebase`, `reset --hard`. Blokuje to też `.claude/settings.json`.
- Pliki cofasz przez `git restore <plik>` (nie `git checkout -- plik`).
- Świeży `main` wciągasz bez zmiany brancha: `git fetch origin && git merge origin/main`.
- Do `main` trafiasz tylko przez **PR** (`gh pr create --base main`). PR-y merguje lead (Kacper) w oknach merge: **15:30, 17:30, 19:00, 21:00, 23:00, 01:00, 02:30, 03:45 (freeze)**, a potem tylko fixy do 09:30.
- Kolejność merge w każdym oknie: `infra` → `api` → `ai-core` → `ai-data` → `collector` → `web`.
- Przed PR-em: `git merge origin/main`, konflikty rozwiązane, serwis się buduje, `demo-check` pkt 1.
- Commity w stylu Conventional Commits: `feat(collector): add instagram adapter`. Commituj często, pushuj przynajmniej co godzinę.
- Konflikt w cudzym pliku → nie rozwiązuj go „po swojemu”. Napisz do właściciela pliku.

## Zespół i branche
| Osoba | Branch | Katalogi (tylko tu commitujesz) | Plik roli |
|---|---|---|---|
| Kacper (lead) | `team/lead-collector` | `collector/`, `CLAUDE.md`, `.claude/`, `.githooks/`, `docs/team/` | `docs/team/1-lead-collector.md` |
| Python #1 | `team/ai-core` | `ai/app/*.py` (bez `embeddings.py`, `eval.py`), `ai/app/modules/`, `ai/prompts/`, `ai/rules/`, `ai/config.yaml`, `ai/pyproject.toml`, `ai/Dockerfile` | `docs/team/2-ai-core.md` |
| Osoba #3 | `team/ai-data` | `ai/app/preprocess/`, `ai/app/embeddings.py`, `ai/app/eval.py`, `ai/eval/`, `ai/seed/` | `docs/team/3-ai-data.md` |
| Osoba #4 | `team/api` | `api/`, `docs/contracts.md`, `infra/db/` | `docs/team/4-api.md` |
| Osoba #5 | `team/web` | `web/` | `docs/team/5-web.md` |
| Osoba #6 | `team/infra` | `docker-compose.yml`, `infra/` (bez `infra/db/`), `README.md`, `.env.example`, `docs/` (bez `contracts.md` i `team/`), `presentation/` | `docs/team/6-infra-pitch.md` |

Pliki wspólne w `ai/` (`ai/app/main.py`, `ai/app/models.py`, `ai/pyproject.toml`) należą do **Python #1**. Osoba #3 zgłasza mu zmiany albo dodaje je w PR-ze opisanym jako „wymaga akceptu ai-core”.
Logi pracy z AI każdy prowadzi w swoim pliku `docs/ai-log/<branch-bez-team>.md` (np. `docs/ai-log/web.md`), żeby nie było konfliktów. Osoba #6 scala je rano do `docs/AI_PROCESS.md`.
Zależności każdy serwis wpisuje do własnego `<serwis>/DEPENDENCIES.md`.

## Proces AI (to jest oceniane — 20%)
- Ten `CLAUDE.md` + skille w `.claude/skills/` = nasz standard pracy z asystentem. Pokazujemy to na prezentacji.
- Po każdej większej rzeczy zrobionej z Claude dopisz 2–3 linijki do `docs/AI_PROCESS.md`: co zlecono, jaki skill użyto, co człowiek poprawił lub zweryfikował.
- Kod wygenerowany przez AI czyta człowiek przed merge'em. AI nie dodaje paczek z pominięciem `dependency-guard`.

## Skille w tym repo — kiedy ich używać
- `scraper-adapter` — dodajesz lub zmieniasz źródło danych (strona, social media, próbka z pendrive'a).
- `risk-classifier` — zmieniasz logikę modułu 1/2/3, prompt, scoring albo ewaluację.
- `data-contract` — zmieniasz tabelę, JSON albo endpoint współdzielony między serwisami.
- `dependency-guard` — przed dodaniem JAKIEJKOLWIEK zależności.
- `demo-check` — przed każdym checkpointem i przed oddaniem.
