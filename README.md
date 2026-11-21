# InvestWatch — HackNation 2026 (UKNF)

System monitoringu treści o instrumentach i usługach finansowych w polskim internecie (100% open-source i on-premise).

## Architektura i przepływ danych

```mermaid
flowchart LR
  web["web<br/>React + Vite (:5173)"]
  api["api<br/>Fastify + Drizzle + Socket.io (:3000)"]
  collector["collector<br/>Playwright + BullMQ"]
  ai["ai<br/>FastAPI (:8000)"]
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
  ai -- "embeddingi bge-m3 + LLM M1/M2/M3" --> ollama
  ai -- "POST /internal/alerts (riskLevel=high, X-Internal-Token)" --> api
```

## Wymagania sprzętowe

- **RAM:** minimum 16 GB (zalecane 24–32 GB przy jednoczesnym działaniu bazy, Playwrighta i modelu LLM).
- **GPU / CPU dla Ollama:**
  - Zalecane GPU NVIDIA >= 8 GB VRAM (uruchamiane opcjonalnym nadpisaniem `infra/docker-compose.gpu.yml`).
  - W trybie CPU inferencja LLM jest wolniejsza; reguły i dopasowanie embeddingów działają niezależnie.
- **Dysk:** minimum 15 GB wolnego miejsca (model `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M`, `bge-m3`, obrazy Docker oraz przeglądarka Chromium dla Playwrighta).

## Quick Start

1. Skopiuj szablon środowiska (zawiera domyślne wartości dev do uruchomienia demo; w produkcji zmień hasła i tokeny):

```bash
cp .env.example .env
```

2. Uruchom cały stos jedną komendą:

```bash
docker compose up --build -d
```

   Wariant z GPU NVIDIA:

```bash
docker compose -f docker-compose.yml -f infra/docker-compose.gpu.yml up --build -d
```

3. Sprawdź status kontenerów i endpointy kontrolne:

```bash
docker compose ps
curl -s http://localhost:8000/health
curl -s http://localhost:3000/health
```

## Serwisy i porty

| Serwis | Technologia | Port | Rola |
|---|---|---|---|
| `web` | React + Vite + TS | `5173` | Dashboard analityka UKNF, filtry, trendy, kalibracja, toasty alertów |
| `api` | Node 22 + Fastify + Drizzle + Socket.io | `3000` | REST API, eksport, `X-Internal-Token`, eventy real-time |
| `ai` | Python 3.12 + FastAPI | `8000` | Czyszczenie tekstu, dedup (hash + simhash), `bge-m3`, moduły M1/M2/M3, `/eval` |
| `collector` | Node 22 + TypeScript + Playwright + BullMQ | — | Harmonogram i wykonywanie crawli, zapis HTML/screenshotów do S3 |
| `postgres` | `pgvector/pgvector:0.8.7-pg16` | `5432` | Dane relacyjne i wektory `vector(1024)` (init z `infra/db/`) |
| `valkey` | `valkey/valkey:8.1.12-alpine` | `6379` | Broker kolejek BullMQ (`crawl-source`) |
| `seaweedfs` | `chrislusf/seaweedfs:3.96` | `8333` | Object storage kompatybilny z S3 (bucket inicjowany przez `s3-init`) |
| `ollama` | `ollama/ollama:0.40.17` | `11434` | Lokalna inferencja LLM i embeddingów (modele pobiera `ollama-init`) |

## Konfiguracja

Wszystkie zmienne środowiskowe oraz ich opisy znajdują się w [.env.example](.env.example). Sekrety są przekazywane do kontenerów wyłącznie przez `env_file: [.env]` — pliku `.env` nie wolno commitować do repozytorium. Kontrakt schematu bazy danych i endpointów znajduje się w [docs/contracts.md](docs/contracts.md), a raport bezpieczeństwa i audytu zależności w [docs/SECURITY.md](docs/SECURITY.md).
