# 2 · Python #1 — AI core (moduły, prompty, scoring)

**Branch:** `team/ai-core` (stały, nie zmieniasz)
**Odpowiadasz za:** serwis `ai/` jako całość (FastAPI `main.py`, `models.py`, `pyproject.toml`, Dockerfile), Ollama, moduły M1/M2/M3 w `ai/app/modules/`, prompty `ai/prompts/`, reguły `ai/rules/`, `scoring.py`, `config.yaml`, alerty do api.
**Nie dotykasz:** `ai/app/preprocess/`, `embeddings.py`, `eval.py`, `ai/eval/` (osoba #3), reszta repo.
**Dajesz innym:** `POST /analyze/{id}`, `POST /reanalyze`, `GET /health`, rekordy `findings`, `POST api/internal/alerts`.
**Czekasz na:** schemat DB (#4, 15:30), preprocessing i embedding (#3, ~18:00), załącznik UKNF z wymogami M2.

## Zadania
### 14:30–15:30
- [ ] **Pobierz modele od razu**: LLM (Bielik 11B Q4; fallback mniejsza Gemma) + `bge-m3`. Sprawdź, na czyim laptopie się zmieszczą (VRAM) i ile trwa jedna odpowiedź.
- [ ] Szkielet `ai/` (FastAPI, Pydantic v2, ruff, logging, uv, Dockerfile), `/health` sprawdzający Ollamę.
**DoD:** `/health` zwraca `ollama: ok` w compose.

### 15:30–19:00
- [ ] `/analyze/{id}`: pobranie dokumentu → wywołanie preprocessingu #3 (na początku stub) → routing modułów → zapis `findings`.
- [ ] M2 v1: prompt z checklistą ryzyka, JSON przez `format` (schema z Pydantic), `temperature 0`, walidacja cytatów.
**DoD 19:00:** dokument z próbki daje finding M2 z cytatem widocznym w bazie.

### 20:00–00:00
- [ ] M2 v2: pełna checklista z załącznika + heurystyka proporcji zysk/ryzyko.
- [ ] M3: słownik fraz doradztwa (`rules/m3.yaml`), anchory, prompt, scoring hybrydowy.
- [ ] Integracja M1 od #3 w routingu.
- [ ] Alert: `risk_level == high` → `POST api/internal/alerts`.
**DoD 00:00:** wszystkie 3 moduły zapisują findingi, alert dociera do dashboardu.

### 00:00–04:00
- [ ] Z #3: strojenie wag i progów na gold secie, porównanie wersji promptów (liczby przed/po na slajd).
- [ ] Odporność: timeout 60 s + retry, awaria = `failed`, nigdy wymyślony score.
- [ ] Ochrona przed prompt injection w treści stron (ogranicznik `<document>`, test na 2–3 złośliwych przykładach).

### 07:00–10:30
- [ ] `ai/DEPENDENCIES.md` (z licencją modelu), `pip-audit`, slajd „jak działa AI” (pipeline + score + kalibracja).

## Twój agent (Claude Code)
**Rola:** pisze endpointy, modele Pydantic, kod modułów, testy dla reguł. Skille: `risk-classifier`, `dependency-guard`, `data-contract` (tylko czytanie — zmiany zleca #4).
**Ty decydujesz i sprawdzasz:** treść promptów i kryteria M2/M3 (merytoryka UKNF), czy cytaty naprawdę uzasadniają flagę, wagi score.

Prompt startowy:
```
Jesteś agentem brancha team/ai-core. Przeczytaj CLAUDE.md, docs/team/2-ai-core.md i docs/contracts.md.
Pracujesz tylko w: ai/app/modules/, ai/prompts/, ai/rules/, ai/app/scoring.py, ai/config.yaml, ai/app/main.py, ai/app/models.py, ai/pyproject.toml.
Nie ruszaj ai/app/preprocess/, embeddings.py, eval.py (branch team/ai-data). Nie zmieniaj brancha.
Zadanie: <wklej>. Użyj skilla risk-classifier. Bez print — logging.
Na koniec: commit, wpis do docs/ai-log/ai-core.md, lista rzeczy do ręcznej weryfikacji.
```
