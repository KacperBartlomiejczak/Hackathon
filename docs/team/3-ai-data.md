# 3 · Osoba #3 — AI data (preprocessing, M1, rejestr KNF, ewaluacja)

**Branch:** `team/ai-data` (stały, nie zmieniasz)
**Odpowiadasz za:** `ai/app/preprocess/` (trafilatura, normalizacja, dedup hash + simhash), `ai/app/embeddings.py` (bge-m3), M1 = dopasowanie firm (`ai/app/preprocess/entity_match.py`), seed rejestru KNF w `ai/seed/` (CSV → `entities`), gold set `ai/eval/gold.csv`, `ai/app/eval.py` (`/eval`).
**Nie dotykasz:** `ai/app/main.py`, `models.py`, `pyproject.toml`, modułów M2/M3 i promptów (ai-core). Potrzebujesz tam zmiany → PR z opisem „wymaga akceptu ai-core” albo prosisz Python #1.
**Dajesz innym:** `clean_text()`, `dedup()`, `embed()`, `match_entities()`, `evaluate(module, threshold)`, tabelę `entities` z danymi.
**Czekasz na:** schemat DB (#4), szkielet `ai/` (ai-core, ~15:30), dane z pendrive'a.

## Zadania
### 14:30–15:30
- [ ] Rejestr firm inwestycyjnych KNF: pobierz/przepisz listę firm (polskie + zagraniczne transgranicznie, oddziały) → `ai/seed/entities.csv` (name, aliases, official_domains, social_handles, register_ref, is_authorized).
- [ ] Przejrzyj dane z pendrive'a: jakie formaty, ile przykładów na moduł.

### 15:30–19:00
- [ ] `clean_text()` (trafilatura + NFKC), `content_hash`, `simhash` + `duplicate_of`.
- [ ] `embed()` przez Ollamę → `documents.embedding`.
- [ ] Skrypt seed `entities` (uruchamiany przy starcie ai, idempotentny).
**DoD 19:00:** dokument po `/analyze` ma `text_clean`, hash i embedding; duplikat dostaje `duplicate_of`.

### 20:00–00:00
- [ ] M1: wykrycie wzmianek firm z rejestru (aliasy + fuzzy match) + sprawdzenie, czy publikujący ≠ `official_domains`/handle firmy → kandydat M1 dla ai-core.
- [ ] Zacznij gold set: **min. 40 przykładów na moduł**, `document_id,module,label`. Opisz zasady oznaczania (2–3 zdania na moduł).

### 00:00–04:00
- [ ] `evaluate(module, threshold)` liczy TP/FP/FN/TN, precision, recall na zapisanych score (bez LLM — ma działać natychmiast przy suwaku).
- [ ] Z ai-core: tabela wyników per wersja promptu i progu → dane do slajdu „kalibracja”.

### 07:00–10:30
- [ ] Testy `ai/tests/` dla dedupu i M1 (choć kilka), opis metodyki oznaczania do prezentacji.

## Twój agent (Claude Code)
**Rola:** pisze preprocessing, dedup, embeddingi, matching firm, `/eval` i testy; parsuje rejestr KNF do CSV. Skille: `risk-classifier`, `dependency-guard`.
**Ty decydujesz i sprawdzasz:** **etykiety w gold secie robisz Ty, nie agent** (inaczej ewaluacja jest bez wartości), poprawność danych z rejestru, progi dedupu.

Prompt startowy:
```
Jesteś agentem brancha team/ai-data. Przeczytaj CLAUDE.md, docs/team/3-ai-data.md i docs/contracts.md.
Pracujesz tylko w: ai/app/preprocess/, ai/app/embeddings.py, ai/app/eval.py, ai/eval/, ai/seed/, ai/tests/.
Nie zmieniaj main.py/models.py/pyproject.toml — jeśli są potrzebne zmiany, wypisz je, a ja przekażę ai-core.
Nie zmieniaj brancha. Nie oznaczaj gold setu za mnie.
Zadanie: <wklej>. Użyj skilla risk-classifier.
Na koniec: commit, wpis do docs/ai-log/ai-data.md, co mam sprawdzić ręcznie.
```
