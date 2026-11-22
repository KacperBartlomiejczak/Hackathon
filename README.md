# InvestWatch — HackNation 2026 (UKNF)

System monitoringu treści o instrumentach i usługach finansowych w polskim internecie (100% open-source i on-premise: modele przez Ollamę, zero zewnętrznych API).

## Architektura i przepływ danych

```mermaid
flowchart LR
  web["web<br/>React + Vite (:5173)"]
  api["api<br/>Fastify + Drizzle + Socket.io (:3000)"]
  collector["collector<br/>Playwright + BullMQ"]
  ai["ai<br/>FastAPI (:8000)<br/>clean -> dedup -> tokenizacja i embeddingi -> M1/M2/M3"]
  pg[("postgres (pgvector)<br/>PostgreSQL 16 (:5432)")]
  valkey[("valkey<br/>Valkey 8 (:6379)")]
  s3[("seaweedfs (S3)<br/>SeaweedFS (:8333)")]
  ollama["ollama<br/>Bielik 11B + bge-m3 (:11434)"]

  web <-- "REST + Socket.io (alert:new, finding:updated, crawl:status)" --> api
  api -- "kolejka crawl-source" --> valkey
  api <--> pg
  api -- "presigned URL screenshotow" --> s3
  valkey -- "joby crawl-source" --> collector
  collector -- "HTML + screenshoty" --> s3
  collector -- "documents, crawl_runs" --> pg
  collector -- "POST /internal/crawl-status (X-Internal-Token)" --> api
  collector -- "POST /analyze/{document_id}" --> ai
  ai -- "odczyt HTML" --> s3
  ai <--> pg
  ai -- "tokeny i embeddingi bge-m3 + LLM M1/M2/M3" --> ollama
  ai -- "POST /internal/alerts (riskLevel=high, X-Internal-Token)" --> api
```

### Etapy preprocessingu i analizy w serwisie `ai`
1. **Ekstrakcja i czyszczenie tekstu:** `trafilatura` usuwa szum HTML, pozostawiając czystą treść (`text_clean`).
2. **Deduplikacja:** dokładna (`content_hash` SHA-256) oraz przybliżona (64-bitowy `simhash` na 3-gramach słów, próg odległości Hamminga `6`).
3. **Tokenizacja i embeddingi:** tekst jest dzielony na tokeny do dopasowania fleksyjnego/leksykalnego (polskie końcówki, granice słów i anchory promocyjne dla 86 podmiotów KNF) oraz przekształcany przez model **`bge-m3`** w gęsty wektor semantyczny **`vector(1024)`** zapisywany w `pgvector`.
4. **Klasyfikacja M1 / M2 / M3 i walidacja cytatów:** hybrydowy scoring (`score = w_llm * llm + w_rules * rules + w_emb * emb`) z udziałem modelu **`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`** oraz weryfikacją dosłownych cytatów w tekście (`rapidfuzz.partial_ratio >= 90`).

### Uzasadnienie wyboru modeli: Bielik-11B + `bge-m3` (zamiast Gemma / klasycznego BERT)
- **`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` zamiast ogólnego modelu `Gemma`:**
  - **Natywny polski tokenizer i korpus:** Bielik (SpeakLeash / ACK Cyfronet AGH) został wytrenowany na szerokim polskim korpusie z dedykowanym polskim tokenizerem, dzięki czemu znacznie lepiej radzi sobie z polską fleksją, idiomami reklamowymi oraz terminologią finansowo-regulacyjną KNF/UKNF niż ogólne modele wielojęzyczne pokroju Gemmy.
  - **Precyzja cytowania i struktury JSON:** przy 11B parametrów (w kwantyzacji `Q4_K_M` mieszczącej się na pojedynczym GPU/CPU) stabilnie zwraca odpowiedzi zgodne ze schematem Pydantic (`format`, `temperature: 0`) i dosłowne cytaty z polskiego tekstu.
  - **Licencja Apache-2.0 i działanie 100% on-premise:** pełne prawo do komercyjnego i instytucjonalnego wdrożenia w infrastrukturze UKNF bez wysyłania wrażliwych materiałów nadzorczych do chmury.
- **`bge-m3` zamiast klasycznego `BERT`:**
  - Obsługuje długi kontekst (do 8192 tokenów wobec 512 w klasycznym BERT), daje 1024-wymiarowe wielojęzyczne embeddingi o wysokiej jakości dopasowania semantycznego dla polskich fraz doradczych (M3) i działa natywnie w tym samym silniku Ollama na licencji MIT.

## Wymagania sprzętowe

- **Docker:** silnik z Compose v2.
- **RAM:** minimum 16 GB (zalecane 32 GB przy jednoczesnym działaniu bazy, Playwrighta i modelu LLM).
- **GPU / CPU dla Ollama:**
  - Zalecane GPU NVIDIA >= 8 GB VRAM (uruchamiane opcjonalnym nadpisaniem `infra/docker-compose.gpu.yml`).
  - W trybie CPU inferencja LLM jest wolniejsza; reguły i dopasowanie embeddingów działają niezależnie.
- **Równoległość Ollamy:** `OLLAMA_NUM_PARALLEL` w `.env` (domyślnie `1`). Przy `1` moduły M1 i M3 jednego dokumentu czekają na siebie (pomiar ai-core: ok. 82 s na dokument). `2` pozwala liczyć je równolegle kosztem drugiego KV cache, więc wymaga więcej RAM/VRAM.
- **Dysk:** minimum **25 GB** wolnego miejsca (modele `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` i `bge-m3` to łącznie **~7–8 GB**, do tego obrazy Docker oraz przeglądarka Chromium dla Playwrighta).
- **Czas pierwszego uruchomienia (zimny start):** pierwsze uruchomienie pobiera obrazy oraz ~7–8 GB modeli Ollamy (`ollama-init`), a samo załadowanie Bielika 11B Q4 trwa **> 60 s**. Serwisy `ai` i `collector` czekają na zakończenie inicjalizacji (`s3-init`, `ollama-init`) — postęp sprawdzisz przez `docker compose logs -f ollama-init`.

## Quick Start

1. Skopiuj szablon środowiska (zawiera domyślne wartości dev do uruchomienia demo; poza demo zmień hasła i `INTERNAL_TOKEN`):

```bash
cp .env.example .env
```

2. Uruchom cały stos jedną komendą (pierwszy start z pobraniem ~7–8 GB modeli Ollamy i zimnym startem > 60 s potrwa kilka minut):

```bash
docker compose up --build -d
```

   Wariant z GPU NVIDIA:

```bash
docker compose -f docker-compose.yml -f infra/docker-compose.gpu.yml up --build -d
```

3. Sprawdź postęp i status kontenerów (dashboard dostępny pod `http://localhost:5173`):

```bash
docker compose logs -f ollama-init
docker compose ps
curl -s http://localhost:8000/health
curl -s http://localhost:3000/health
```

4. Po aktualizacji repo na **istniejącym wolumenie** Postgresa pliki `infra/db/*.sql` nie uruchomią się ponownie (działają tylko na pustym wolumenie). Zastosuj nowe migracje ręcznie (są idempotentne), np.:

```bash
docker compose exec -T postgres sh -c 'psql -U "${POSTGRES_USER:-investwatch}" -d "${POSTGRES_DB:-investwatch}"' < infra/db/004_seen_tracking.sql
```

   Objaw braku migracji: `GET /findings` zwraca 500 (`column ... does not exist`). Nie używaj `docker compose down -v`: kasuje też wolumen `ollama_data` (kilka GB modeli) i bazę.

## Serwisy i porty

`postgres`, `valkey`, `seaweedfs`, `ollama` i `ai` są dostępne tylko z hosta (`127.0.0.1`); z sieci zewnętrznej widoczne są wyłącznie `web` (5173) i `api` (3000).


| Serwis | Technologia | Port | Rola |
|---|---|---|---|
| `web` | React + Vite + TS (Nginx) | `5173` | Dashboard analityka UKNF, filtry, trendy, kalibracja, toasty alertów |
| `api` | Node 22 + Fastify + Drizzle + Socket.io | `3000` | REST API, eksport, `X-Internal-Token`, eventy real-time |
| `ai` | Python 3.12 + FastAPI | `127.0.0.1:8000` | Czyszczenie tekstu, dedup, tokenizacja i embeddingi `bge-m3`, moduły M1/M2/M3, `/eval` |
| `collector` | Node 22 + TypeScript + Playwright + BullMQ | — | Harmonogram i wykonywanie crawli, zapis HTML/screenshotów do S3 |
| `postgres` | `pgvector/pgvector:0.8.7-pg16` | `127.0.0.1:5432` | Dane relacyjne i wektory `vector(1024)` (init z `infra/db/`) |
| `valkey` | `valkey/valkey:8.1.12-alpine` | `127.0.0.1:6379` | Broker kolejek BullMQ (`crawl-source`) |
| `seaweedfs` | `chrislusf/seaweedfs:3.96` | `127.0.0.1:8333` | Object storage kompatybilny z S3, z kluczami (bucket inicjowany przez `s3-init`) |
| `ollama` | `ollama/ollama:0.40.17` | `127.0.0.1:11434` | Lokalna inferencja LLM i embeddingów (modele pobiera `ollama-init`) |

## Konfiguracja i dokumentacja

Wszystkie zmienne środowiskowe oraz ich opisy znajdują się w [.env.example](.env.example). Sekrety są przekazywane do kontenerów wyłącznie przez `env_file: [.env]` — pliku `.env` nie wolno commitować do repozytorium.
Najważniejsze zmienne: `OLLAMA_LLM_MODEL`, `OLLAMA_EMBED_MODEL`, `S3_PUBLIC_ENDPOINT` (adres S3 widziany z przeglądarki), `WEB_ORIGIN`, `VITE_API_URL`.

- Kontrakt schematu DB i API: [docs/contracts.md](docs/contracts.md)
- Bezpieczeństwo i skany obrazów/paczek: [docs/SECURITY.md](docs/SECURITY.md)
- Wykaz bibliotek, narzędzi i licencji: [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)
- Standaryzowany proces pracy z AI: [docs/AI_PROCESS.md](docs/AI_PROCESS.md)
