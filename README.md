# InvestWatch

Monitoring treści o instrumentach i usługach finansowych w polskim internecie (zadanie UKNF, HackNation 2026).
Całość działa on-premise: modele przez Ollamę, bez zewnętrznych API.

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Pierwszy start pobiera modele Ollamy (`bge-m3` i Bielik 11B, razem ok. 8 GB). Serwisy `ai` i `collector` czekają, aż pobieranie się skończy.
Postęp: `docker compose logs -f ollama-init`.

Dashboard: http://localhost:5173

GPU NVIDIA (opcjonalnie):

```bash
docker compose -f docker-compose.yml -f infra/docker-compose.gpu.yml up --build
```

## Wymagania sprzętowe

- Docker z Compose v2
- 16 GB RAM (zalecane 32 GB), 25 GB wolnego dysku
- GPU z 8 GB VRAM opcjonalnie — na CPU analiza LLM jest wolniejsza

## Serwisy

| Serwis | Port | Rola |
|---|---|---|
| web | 5173 | dashboard (React) |
| api | 3000 | REST + Socket.io (Fastify) |
| ai | 8000 | analiza M1/M2/M3, scoring, `/eval` (FastAPI) |
| collector | — | crawling (Playwright + BullMQ) |
| postgres | 5432 | baza (PostgreSQL 16 + pgvector) |
| valkey | 6379 | kolejka jobów |
| seaweedfs | 8333 | S3: surowy HTML i screenshoty |
| ollama | 11434 | modele LLM i embeddingi |

## Konfiguracja

Wszystko w `.env` (wzór: `.env.example`). Wartości w `.env.example` są tylko do demo — poza nim zmień hasła i `INTERNAL_TOKEN`.
Najważniejsze: `OLLAMA_LLM_MODEL`, `OLLAMA_EMBED_MODEL`, `S3_PUBLIC_ENDPOINT` (adres S3 widziany z przeglądarki), `WEB_ORIGIN`, `VITE_API_URL`.

Bezpieczeństwo i licencje: [docs/SECURITY.md](docs/SECURITY.md).
