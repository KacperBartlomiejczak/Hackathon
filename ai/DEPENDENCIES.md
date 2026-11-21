# ai — zależności

Wersje przypięte (`==`) i rozwiązywane z `exclude-newer = 2026-11-07` (tylko wydania starsze niż ~2 tyg.). OSV: 0 znanych podatności na dzień 2026-11-21.

| paczka | wersja | licencja | po co |
|---|---|---|---|
| fastapi | 0.162.0 | MIT | HTTP API |
| uvicorn | 0.54.0 | BSD-3-Clause | serwer ASGI |
| pydantic | 2.14.3 | MIT | modele request/response |
| httpx | 0.28.1 | BSD-3-Clause | klient HTTP do Ollamy i api |
| pyyaml | 6.0.3 | MIT | config.yaml, reguły |
| ruff | 0.17.4 | MIT | lint (dev) |
| pytest | 9.2.0 | MIT | testy (dev) |

Obrazy: `python:3.12.16-slim-bookworm` (PSF), `ghcr.io/astral-sh/uv:0.13.9` (MIT/Apache-2.0).

## Modele (Ollama)
| model | tag | licencja | po co |
|---|---|---|---|
| Bielik 11B v2.3 Instruct | `hf.co/speakleash/Bielik-11B-v2.3-Instruct-GGUF:Q4_K_M` | Apache-2.0 | klasyfikacja M1/M2/M3 |
| bge-m3 | `bge-m3:latest` (id 790764642607) | MIT | embeddingi (1024 wym.) |
