# Scenariusze demo (ai)

Źródło danych: [scenarios.json](scenarios.json). Wyniki zmierzone na Bieliku 11B Q4_K_M (`temperature 0`, powtarzalne), ~35–55 s na dokument.
Endpoint `POST /analyze-text` nic nie zapisuje i nie wysyła alertów; służy do szybkiego pokazu. Alerty pokazuje pełna ścieżka `/analyze/{id}` (niżej).

| # | Scenariusz | Moduł | Oczekiwany wynik | Zmierzony |
|---|---|---|---|---|
| a | Komunikat XTB S.A. na xtb.com, z ostrzeżeniem o ryzyku | M2 | score < 0.4, `low` | 0.000, `low` |
| b | Scam „OFICJALNY partner XTB”, gwarantowany zysk, link w bio | M1 | score ≥ 0.8, `high`, alert | 0.848, `high` |
| c | Polecenie XTB z kodem i „12% w tym roku” (graniczny) | M1 | 0.6–0.79, `medium` | 0.766, `medium` |
| c′ | to samo, wagi llm 0.2 / rules 0.6 / emb 0.2 (jak z panelu kalibracji) | M1 | ≥ 0.8, `high`, alert | 0.824, `high` |
| d | Konto bez licencji: zarządza portfelem, płatne sygnały | M3 | score ≥ 0.8, `high`, alert | 0.914, `high` |

## Uruchomienie

Całość (4 scenariusze + wariant c′, kod wyjścia 1 przy niezgodności z oczekiwaniem):

```bash
python3 ai/scripts/demo_check.py http://localhost:8000
```

Pojedynczy scenariusz (b, scam):

```bash
curl -s -X POST localhost:8000/analyze-text -H 'content-type: application/json' -d '{
  "url": "https://www.instagram.com/p/C0scam123/", "authorHandle": "@pewny_zysk_pl",
  "text": "OFICJALNY partner XTB! Gwarantowany zysk 30% miesięcznie, zero ryzyka. Wpłać 1000 zł, a w 30 dni odbierzesz 1300 zł. XTB potwierdza nasze wyniki, zarabiaj już dziś, miejsc zostało tylko 5! Otwórz konto z moim kodem polecającym, link w bio. Reklama."
}' | python3 -m json.tool
```

Graniczny (c) z nadpisanymi wagami: dodaj do body `"weights": {"llm": 0.2, "rules": 0.6, "emb": 0.2}` (pole opcjonalne, także `"threshold"`).

## Pokaz z alertem i panelem kalibracji (pełna ścieżka, z bazą)

1. Dokument musi być w `documents` (z `html_key` w S3), np. z collectora. Potem `curl -X POST localhost:8000/analyze/{id}`.
2. Dla `high` ai wysyła `POST {API_URL}/internal/alerts` z nagłówkiem `X-Internal-Token` (`INTERNAL_TOKEN`). Wymaga obu zmiennych w `.env`.
3. Kalibracja: `UPDATE module_settings SET weights='{"llm":0.2,"rules":0.6,"emb":0.2}' WHERE module=1;` i ponowny `POST /analyze/{id}` dla dokumentu c: 0.766 → 0.824, powstaje alert.
4. Suwak progu: `curl 'localhost:8000/eval?module=1&threshold=0.8'`. Wymaga wypełnionego `ai/eval/gold.csv` (jest pusty).

## Uwagi
- M2 dostaje tylko dokumenty z domeny/handle firmy z `entities.official_domains`; scam nigdy nie trafi do M2, tylko do M1 (wzmianka firmy przez obcego) lub M3.
- Orlen/KGHM nie ma w `entities.csv` (tylko firmy z rejestrów KNF), więc podszywanie się pod nich nie uruchomi M1. Scenariusze używają XTB.
