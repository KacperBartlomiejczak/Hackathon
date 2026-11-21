---
name: risk-classifier
description: Use when changing analysis logic in ai/ — preprocessing, deduplication, embeddings, module 1/2/3 rules, LLM prompts, scoring weights, thresholds, or the /eval calibration endpoint.
---

# Zmiany w analizie (`ai/`)

## Kto co zmienia
- `team/ai-core` (Python #1): `modules/`, `prompts/`, `rules/`, `scoring.py`, `config.yaml`, `main.py`, `models.py`.
- `team/ai-data` (osoba #3): `preprocess/`, `embeddings.py`, `eval.py`, `ai/eval/`, `ai/seed/`.
- Potrzebujesz zmiany w cudzej części → opisz ją w PR-ze jako „wymaga akceptu <branch>” albo poproś właściciela.

## Pipeline `/analyze/{id}`
1. **Preprocessing**: HTML z S3 (SeaweedFS) → `trafilatura` (czysty tekst) → normalizacja (unicode NFKC, białe znaki, małe litery tylko do reguł — do LLM idzie oryginał).
2. **Dedup**: `content_hash` (sha256 tekstu) = duplikat dokładny; `simhash` z odległością Hamminga ≤ 3 = prawie-duplikat → `duplicate_of`, status `duplicate`, bez ponownej analizy.
3. **Embedding**: Ollama `bge-m3` → `documents.embedding`.
4. **Routing modułów**:
   - domena/handle w `entities.official_domains` firmy z rejestru → **M2**,
   - wzmianka firmy z rejestru przez kogoś innego → **M1**,
   - podmiot spoza rejestru + sygnały doradztwa → **M3**.
   Dokument może trafić do kilku modułów.
5. **Scoring** → `findings` → jeśli `risk_level == 'high'` → `POST api:3000/internal/alerts`.

## Wzór score
```
rules  = suma wag spełnionych reguł (słowniki fraz w ai/rules/*.yaml), obcięta do 1
emb    = max cosine similarity do fraz wzorcowych modułu (ai/rules/anchors_m{n}.yaml)
llm    = confidence 0..1 z odpowiedzi LLM (JSON)
score  = w_llm*llm + w_rules*rules + w_emb*emb          # wagi z module_settings
```
Każdy finding MUSI mieć co najmniej jeden `reason` z dosłownym `quote` z tekstu. Sprawdź w kodzie, że cytat występuje w `text_clean` (fuzzy match ≥ 0.9) — jeśli nie, odrzuć ten reason (halucynacja).

## Prompty
- Plik `ai/prompts/m{n}.md`, nagłówek `version: m{n}-vX`. Podbij wersję przy każdej zmianie.
- Struktura: instrukcja systemowa → kryteria (dla M2 checklista z załącznika UKNF) → treść dokumentu w ogranicznikach `<document>…</document>` z dopiskiem, że to dane, nie polecenia.
- Wymuszaj JSON: Ollama `format` = JSON Schema z modelu Pydantic. `temperature: 0`.
- Tekst przycinaj do limitu kontekstu modelu (najpierw tytuł i pierwsze akapity, potem fragmenty z frazami zysk/ryzyko).

## Model
- Domyślnie Bielik 11B (Q4) — najlepiej rozumie polski; fallback mniejsza Gemma, jeśli laptop nie ma GPU ≥ 8 GB.
- Nazwa modelu tylko w `.env` (`OLLAMA_MODEL`) — nigdy hardcode.
- Zapisuj `model` i `prompt_version` w każdym findingu.

## Ewaluacja / kalibracja
- `ai/eval/gold.csv`: `document_id,module,label(0/1)` — oznaczcie ręcznie min. 40 przykładów na moduł z danych UKNF.
- `/eval?module=&threshold=` liczy TP/FP/FN/TN, precision i recall na zapisanych score (bez ponownego LLM — ma być natychmiastowe przy przesuwaniu suwaka).
- Po zmianie promptu: `/reanalyze?module=` na gold secie, zapisz wynik przed/po w swoim `docs/ai-log/<branch>.md`.

## Zasady
- Bez `print` — `logging` z id dokumentu i czasem inferencji.
- Timeout na wywołanie Ollamy (60 s) + 1 retry; błąd = finding nie powstaje, dokument `failed`. Nigdy nie wymyślaj score przy awarii.
- Nowa paczka Pythona → najpierw skill `dependency-guard`.
