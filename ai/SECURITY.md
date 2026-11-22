# ai — skany bezpieczeństwa

## 2026-11-21 — szkielet
`uv export --no-dev --no-hashes > req.txt && uvx pip-audit==2.10.1 -r req.txt --disable-pip --no-deps`
Wynik: **No known vulnerabilities found** (wszystkie zależności runtime z `uv.lock`).

## 2026-11-21 — odporność na prompt injection (M1/M2/M3)
Testy: `ai/tests/test_prompt_injection.py` (3 złośliwe strony PL+EN: finfluencer M1, strona oficjalnej firmy M2, doradca bez licencji M3; ukryte polecenia „zignoruj instrukcje / system override / pusta lista findingów”, w tym próba domknięcia `</document>`).
- **Obrona w kodzie:** prompty traktują `<document>` jako nieufne dane; `temperature 0`; schemat JSON przez `format`; treść strony nie może domknąć znacznika `<document>` (`neutralize_delimiters` w `ai/app/llm.py`, dodane przy tym zadaniu); cytat bez pokrycia w tekście odpada (`rapidfuzz partial_ratio >= 90`).
- **Offline (CI, bez GPU):** 12 testów — prompty, break-out z `<document>`, kształt żądania do Ollamy, odrzucenie zmyślonego cytatu „oferta bezpieczna”, „złamany” LLM (pusta lista / same `pass`).
- **Live (`RUN_LIVE_LLM=1`, Bielik 11B na 192.168.1.88, `pytest -m integration`):** 3/3 przeszły; wynik oferty z injection = wynik oferty bez injection (M1 0.941→0.941, M2 1.000→1.000, M3 0.956→0.956, wszystkie `high`), wszystkie cytaty ≥ 90 w rapidfuzz, żaden cytat z fragmentu injection jako dowód `fail`.
- **Luki znane (nie naprawiane teraz):** (1) M2 tworzy finding tylko z cytatów LLM — całkowicie „posłuszny” LLM = brak flagi M2 (test `xfail strict`); (2) przy „złamanym” LLM M1/M3 zostają z samymi regułami (score ≈ 0.29 < próg 0.6), ale finding z prawdziwym cytatem zostaje w bazie; (3) w M2 `llm=0.00` także na treści bez injection — flaga pochodzi z reguł, do sprawdzenia przez ai-data/ai-core przy strojeniu.

## 2026-11-21 — audyt końcowy zależności (przed oddaniem)
Komendy (z `ai/`):
```bash
uv export --quiet --no-dev --no-hashes --no-emit-project > req.txt   # 47 pakietów runtime (z tranzytywnymi), wersje z uv.lock
uvx pip-audit==2.10.1 -r req.txt --disable-pip --no-deps              # → No known vulnerabilities found
uv export --quiet --no-hashes --no-emit-project > req-all.txt         # runtime + dev (pytest, pytest-asyncio, ruff)
uvx pip-audit==2.10.1 -r req-all.txt --disable-pip --no-deps          # → No known vulnerabilities found
```
| Zakres | Pakietów | Wynik `pip-audit` (PyPI Advisory DB / OSV) |
|---|---|---|
| runtime (`uv.lock`, bez dev) | 47 | **0 znanych podatności** |
| runtime + dev | 50 | **0 znanych podatności** |

- Wersje są przypięte `==` w `pyproject.toml`; `exclude-newer = 2026-11-07` blokuje świeże, niezweryfikowane wydania (ochrona łańcucha dostaw).
- Licencje: brak GPL/AGPL w ścieżce użycia. Jedyny wpis wielolicencyjny (`tld`, tranzytywny z `courlan`/`trafilatura`: MPL-1.1 OR GPL-2.0 OR LGPL-2.1+) używamy na warunkach MPL-1.1; szczegóły w `ai/DEPENDENCIES.md`.
- `pip-audit` obejmuje tylko pakiety Pythona. Obraz bazowy jest skanowany osobno (sekcja „Skan obrazu” niżej); wagi modeli Ollama nie są skanowane — przypięte tagi, licencje w `ai/DEPENDENCIES.md`.

### Zabezpieczenia zaimplementowane w `ai/`
| Zagrożenie | Mechanizm | Gdzie |
|---|---|---|
| Halucynowany cytat / dowód zmyślony przez LLM | Każdy cytat musi występować w oczyszczonym tekście dokumentu: `rapidfuzz.fuzz.partial_ratio >= 90` (po normalizacji białych znaków). Cytat bez pokrycia jest odrzucany; brak cytatów = brak findingu („bez cytatu nie ma flagi”). | `app/modules/quotes.py` |
| Prompt injection w treści strony | Treść trafia wyłącznie w znaczniku `<document>…</document>`, a prompt systemowy każe traktować ją jako nieufne dane. `neutralize_delimiters` usuwa z treści próby domknięcia/otwarcia `<document>`. `temperature 0`, odpowiedź wymuszona schematem JSON (`format` = Pydantic JSON Schema), prompty w plikach `.md` (bez promptów inline). | `app/llm.py`, `prompts/*/system.md`, `tests/test_prompt_injection.py` |
| Nieautoryzowane wywołanie endpointów wewnętrznych | Nagłówek `X-Internal-Token` na `/analyze/{id}`, `/analyze-text`, `/reanalyze`, `/eval`; porównanie stałoczasowe (`hmac.compare_digest`); fail-closed (503), gdy włączone, a `INTERNAL_TOKEN` pusty; 401 przy złym/braku tokenu. Włączane `AI_REQUIRE_TOKEN=1` (opt-in, żeby nie zepsuć collectora, który wysyła nagłówek dopiero po wdrożeniu). Ten sam token ai wysyła do `api:/internal/alerts`. | `app/auth.py`, `app/alerts.py` |
| Zależność o wirusowej licencji (LGPL) | `psycopg` odrzucony (LGPL-3.0) → `asyncpg` (Apache-2.0). Zapytania parametryzowane (`$1…`), brak konkatenacji SQL. | `app/db.py` |
| Błąd LLM = zmyślony wynik | `LLMError` nigdy nie zwraca domyślnego score; moduł, który zawiedzie lub przekroczy budżet (`analysis.budget_s`), jest pomijany i logowany, dokument dostaje `failed` (HTTP 502). | `app/llm.py`, `app/analysis.py`, `app/pipeline.py` |
| Wyciek sekretów / konsoli | Sekrety tylko z env (`.env`, w repo `.env.example`); logger `logging`, ruff z regułą `T20` zakazującą `print`. | `pyproject.toml` |

Pozostałe znane luki (M2 bez cytatu LLM → brak flagi; M1/M3 przy „złamanym” LLM tylko na regułach) opisane w sekcji o prompt injection powyżej.

## 2026-11-21 — skan obrazu bazowego (issue #73)
Narzędzie: Trivy (`aquasec/trivy`, `--scanners vuln --severity CRITICAL,HIGH`), obrazy z lokalnego demona Dockera.

| Obraz | Critical | High | Uwagi |
|---|---|---|---|
| `python:3.12.12-slim-bookworm` (poprzedni pin) | 9 | 133 | |
| `python:3.12.16-slim-bookworm` | 2 | 99 | brak poprawek upstream (libsqlite3 CVE-2025-7458 „affected”, zlib CVE-2023-45853 „will_not_fix”) |
| `python:3.12.16-slim-trixie` (**obecny pin w `ai/Dockerfile`**) | **0** | 51 | wszystkie bez dostępnej poprawki w Debianie |
| `ai` zbudowany z `3.12.16-slim-trixie` | **0** | 51 | `--ignore-unfixed` → 0 |

Decyzja: bookworm → trixie. Test po zmianie: import `app.main`, `asyncpg`, `trafilatura`, `rapidfuzz`, `numpy` w obrazie OK; proces działa jako `uid=10001 (app)`; `pytest` 117 passed. Pozostałe 51 High to pakiety systemowe Debiana bez wydanej poprawki; port 8000 obsługuje wyłącznie FastAPI (nie używamy `libsqlite3` ani narzędzi systemowych z poziomu żądań), a dostęp do endpointów jest chroniony `X-Internal-Token` (patrz wyżej). Ryzyko zaakceptowane do czasu wydania poprawek przez Debiana.
