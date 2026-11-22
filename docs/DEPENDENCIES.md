# Zależności i licencje — InvestWatch

UKNF przejmuje prawa do kodu, więc cały stos używa wyłącznie licencji permisywnych (MIT, Apache-2.0, BSD, ISC, PostgreSQL, PSF; dopuszczalne przejściowo: MPL-2.0 dla `certifi` oraz wybór MPL-1.1 dla trójlicencyjnego `tld`).

## 0. Narzędzia wymagane do zbudowania i uruchomienia

- **Środowisko kontenerowe (cały stos):** Docker Engine + Docker Compose v2, Git.
- **Dodatkowo przy uruchomieniu deweloperskim poza Dockerem:** Node.js 22 + npm 11 (`collector/`, `api/`, `web/`), Python 3.12 + `uv 0.9.15` (`ai/`).

## 1. Obrazy Docker (`docker-compose.yml` i `Dockerfile` serwisów)

| Serwis | Obraz i przypięty tag | Licencja projektu / bazy | Rola |
|---|---|---|---|
| `postgres` | `pgvector/pgvector:0.8.7-pg16` | PostgreSQL License | Baza relacyjna PostgreSQL 16 + wektory `pgvector` |
| `valkey` | `valkey/valkey:8.1.12-alpine` | BSD-3-Clause | Broker kolejek BullMQ (zamiast Redisa RSAL/SSPL) |
| `seaweedfs` | `chrislusf/seaweedfs:3.96` | Apache-2.0 | Object storage kompatybilny z S3 (zamiast MinIO AGPL) |
| `ollama` | `ollama/ollama:0.40.17` | MIT | Lokalny silnik inferencji LLM i embeddingów |
| `s3-init`, `ollama-init` | `curlimages/curl:8.23.0` | curl (MIT-like) | Jednorazowe utworzenie bucketa S3 i pobranie modeli Ollamy |
| `api`, `collector` (build) | `node:22.23.5-bookworm-slim` | MIT (Node.js) | Środowisko Node 22 (build i runtime `api`) |
| `collector` (runtime) | `mcr.microsoft.com/playwright:v1.65.1-noble` | Apache-2.0 | Runtime z preinstalowanym Chromium dla Playwrighta |
| `ai` | `python:3.12.16-slim-trixie` + `ghcr.io/astral-sh/uv:0.9.15` | PSF / MIT+Apache-2.0 | Środowisko Python 3.12 i menedżer pakietów `uv` |
| `web` (build) | `node:22.23.5-alpine` | MIT (Node.js) | Build aplikacji Vite/React |
| `web` (runtime) | `nginx:1.30.7-alpine` + `apk upgrade libxml2` | BSD-2-Clause | Serwowanie statycznego bundla SPA na porcie `5173` |

## 2. Modele AI (Ollama — on-premise)

| Model | Tag w `.env.example` / `ai/DEPENDENCIES.md` | Parametry / rozmiar / kontekst | Licencja | Rola |
|---|---|---|---|---|
| Bielik 11B v2.3 Instruct *(domyślny)* | `SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` *(w `ai/DEPENDENCIES.md` też alias HF `hf.co/SpeakLeash/Bielik-11B-v2.3-Instruct-GGUF:Q4_K_M`)* | 11.2B, Q4_K_M, ~6.7 GB, kontekst 32 768 | Apache-2.0 | Klasyfikacja i uzasadnienia M1/M2/M3 |
| bge-m3 *(domyślny)* | `bge-m3` (`bge-m3:latest`) | 566.7M, F16, ~1.2 GB, kontekst 8192 | MIT | Embeddingi wielojęzyczne (`vector(1024)`) |
| Bielik 11B v3.0 Instruct *(opcjonalny)* | `SpeakLeash/bielik-11b-v3.0-instruct:Q4_K_M` | 11.2B, Q4_K_M, ~6.7 GB, kontekst 32 768 | Apache-2.0 | Opcjonalny drop-in przez `OLLAMA_LLM_MODEL` (niepobierany domyślnie) |
| gemma4 *(porównawczy)* | `gemma4:latest` | 8.0B, Q4_K_M, ~9.6 GB, kontekst 131 072 | Apache-2.0 | Model porównawczy (niepobierany domyślnie) |

## 3. Zestawienie zależności serwisów (scalone z `<serwis>/DEPENDENCIES.md`)

### `collector/` (`collector/DEPENDENCIES.md`, 10 runtime / 6 dev w `package.json`)
- Runtime: `pino@10.4.0` (MIT), `zod@4.6.7` (MIT), `yaml@2.9.1` (ISC), `bullmq@6.7.8` (MIT), `ioredis@5.11.1` (MIT), `playwright@1.65.1` (Apache-2.0), `p-limit@7.3.3` (MIT), `drizzle-orm@0.45.4` (Apache-2.0), `pg@8.23.1` (MIT), `@aws-sdk/client-s3@3.1175.0` (Apache-2.0).
- Dev: `typescript@5.9.3` (Apache-2.0), `tsx@4.23.15` (MIT), `@types/node@22.20.5` (MIT), `@types/pg@8.23.1` (MIT), `eslint@10.15.0` (MIT), `typescript-eslint@8.73.0` (MIT).
- Notka (`collector/DEPENDENCIES.md`): npm zablokował install script opcjonalnego `msgpackr-extract` — działa fallback w czystym JS.

### `api/` (`api/DEPENDENCIES.md`, 12 runtime / 7 dev w `package.json`; `129 prod + 122 dev` w `package-lock.json` wg `api/SECURITY.md`)
- Runtime: `fastify@5.12.8` (MIT), `@fastify/cors@11.4.3` (MIT), `@fastify/rate-limit@11.3.0` (MIT), `socket.io@4.8.4` (MIT), `drizzle-orm@0.45.4` (Apache-2.0), `pg@8.23.1` (MIT), `zod@4.6.7` (MIT), `pino@10.4.0` (MIT), `bullmq@6.7.8` (MIT), `ioredis@5.11.1` (MIT), `@aws-sdk/client-s3@3.1175.0` (Apache-2.0), `@aws-sdk/s3-request-presigner@3.1175.0` (Apache-2.0).
- Dev: `typescript@5.9.3` (Apache-2.0), `tsx@4.23.15` (MIT), `@types/node@22.20.5` (MIT), `@types/pg@8.23.1` (MIT), `eslint@10.15.0` (MIT), `@eslint/js@10.0.1` (MIT), `typescript-eslint@8.73.0` (MIT).

### `ai/` (`ai/DEPENDENCIES.md`, `exclude-newer = "2026-11-07T00:00:00Z"`, 10 runtime / 3 dev w `pyproject.toml`)
- Runtime: `fastapi==0.162.0` (MIT), `uvicorn[standard]==0.54.0` (BSD-3-Clause), `pydantic==2.14.3` (MIT), `httpx==0.28.1` (BSD-3-Clause), `asyncpg==0.32.0` (Apache-2.0 — zamiast `psycopg` LGPL-3.0), `boto3==1.43.126` (Apache-2.0), `trafilatura==2.3.1` (Apache-2.0), `rapidfuzz==3.14.6` (MIT), `numpy==2.5.4` (BSD-3-Clause), `pyyaml==6.0.3` (MIT).
- Dev: `ruff==0.17.4` (MIT), `pytest==9.2.0` (MIT), `pytest-asyncio==1.4.1.post1` (Apache-2.0).
- Notka licencyjna (`ai/DEPENDENCIES.md`, 47 paczek runtime / 50 z dev w `uv.lock`): przejściowo `certifi` (MPL-2.0, niezmodyfikowany) oraz `tld` (potrójna licencja MPL-1.1 / GPL-2.0 / LGPL-2.1+ — używany na warunkach MPL-1.1, bez modyfikacji); zero GPL/AGPL/SSPL w ścieżce użycia.

### `web/` (`web/DEPENDENCIES.md`, 10 `dependencies` / 8 `devDependencies` w `package.json`)
- Runtime: `react@19.3.1` (MIT), `react-dom@19.3.1` (MIT), `react-router-dom@7.18.6` (MIT), `@tanstack/react-query@5.108.2` (MIT), `recharts@3.11.0` (MIT), `socket.io-client@4.8.4` (MIT), `sonner@2.0.8` (MIT), `lucide-react@1.77.0` (ISC), `clsx@2.1.1` (MIT), `tailwind-merge@3.7.1` (MIT).
- Dev (w tym CSS build-time): `vite@8.3.8` (MIT), `@vitejs/plugin-react@6.3.0` (MIT), `typescript@7.0.2` (Apache-2.0), `@types/react@19.3.0` (MIT), `@types/react-dom@19.3.0` (MIT), `tailwindcss@4.3.5` (MIT), `@tailwindcss/vite@4.3.5` (MIT), `vitest@5.1.0` (MIT — testy jednostkowe czystych funkcji, dodane w PR #82; wersja `5.1.1` pominięta jako za świeża, `5.1.0` akceptuje `vite 8`).
