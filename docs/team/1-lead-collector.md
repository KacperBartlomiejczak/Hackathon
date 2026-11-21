# 1 · Kacper — lead + collector

**Branch:** `team/lead-collector` (stały, nie zmieniasz)
**Odpowiadasz za:** `collector/`, `CLAUDE.md`, `.claude/`, `.githooks/`, merge PR-ów do `main` w oknach, decyzje techniczne i cięcie zakresu.
**Nie dotykasz:** `ai/`, `api/`, `web/`, `infra/`, `docs/contracts.md` (zmiany kontraktu zlecasz osobie #4).
**Dajesz innym:** dokumenty w tabeli `documents`, pliki w S3, wywołanie `POST ai:8000/analyze/{id}`, endpoint do ręcznego odpalenia crawla (przez api).
**Czekasz na:** schemat DB od #4 (15:30), compose od #6 (15:30), `/analyze` od ai-core (~17:30).

## Zadania
### 14:30–15:30
- [ ] Repo na GitHubie: pierwszy commit paczki startowej na `main` (**zanim** włączysz hook), potem utworzenie 6 branchy bez przełączania się:
  ```bash
  for b in lead-collector ai-core ai-data api web infra; do git branch team/$b; done
  git push origin --all
  ```
- [ ] **Ochrona `main`** na GitHubie (Settings → Branches): wymagany PR, bez force push.
- [ ] Każda osoba **jeden raz** na starcie (to jedyna zmiana brancha na cały hackathon):
  ```bash
  git clone <repo> && cd <repo>
  git switch team/<swoj-branch>
  git config core.hooksPath .githooks && chmod +x .githooks/pre-commit
  ```
- [ ] Szkielet `collector/` (TS strict, pino, zod, Dockerfile), `collector/sources.yaml`.
**DoD:** każdy siedzi na swoim branchu, hook działa (testowy commit w cudzym katalogu jest blokowany).

### 15:30–19:00 — pionowy plaster
- [ ] BullMQ na Valkey: kolejki `crawl-source` i `crawl-item`, retry 3, backoff.
- [ ] Adapter `sample` (dane z pendrive'a UKNF, offline) — **priorytet nr 1, na nim stoi demo**.
- [ ] Adapter `web` (Playwright, pula przeglądarek, screenshot, HTML do S3, upsert do `documents`).
- [ ] Wywołanie `/analyze` po zapisie (z retry; brak ai ≠ crash).
**DoD 19:00:** 10 dokumentów z próbki w bazie, dla każdego poszło `/analyze`.

### 20:00–00:00
- [ ] Rotacja UA (lista ≥ 20) + proxy z `PROXY_LIST`.
- [ ] Adaptery social na publicznych treściach: najpierw ten, który realnie działa (YouTube/strony finfluencerów), potem Instagram/Facebook/TikTok best effort. Blokada → czytelny błąd w `crawl_runs`.
- [ ] Harmonogram: powtarzalne joby z `cron` z `sources`.
**DoD 00:00:** min. 2 źródła live + sample, crawl odpalany z harmonogramu i ręcznie.

### 00:00–04:00
- [ ] Stabilność: timeouty, limit per domena, statusy `crawl_runs`, emit `crawl:status`.
- [ ] Merge okien 01:00, 02:30, **03:45 = freeze**. Decyzja, co wypada z zakresu.

### 07:00–10:30
- [ ] Z #6: README (sekcja collector), slajd architektury, prowadzenie demo.
- [ ] 10:30 oddanie.

## Jak mergujesz PR-y (bez zmiany brancha)
```bash
gh pr list --base main
gh pr checks <nr>          # albo szybki przegląd diffa: gh pr diff <nr>
gh pr merge <nr> --merge   # kolejność: infra → api → ai-core → ai-data → collector → web
```
Po każdym oknie: `git fetch origin && git merge origin/main` u siebie + napisz na kanale „main zaktualizowany, zróbcie merge origin/main”.

## Twój agent (Claude Code)
**Rola:** implementuje adaptery, kolejkę i harmonogram w `collector/`. Skille: `scraper-adapter`, `dependency-guard`, `demo-check`.
**Ty decydujesz i sprawdzasz:** selektory na realnych stronach, czy dane z próbki mapują się dobrze, wszystkie merge do `main`.

Prompt startowy:
```
Jesteś agentem brancha team/lead-collector. Przeczytaj CLAUDE.md i docs/team/1-lead-collector.md.
Pracujesz wyłącznie w collector/ (oraz CLAUDE.md/.claude/ tylko na moje wyraźne polecenie).
Nie zmieniaj brancha, nie twórz nowych, nie commituj na main.
Zacznij od zadania: <wklej zadanie z listy>. Użyj skilla scraper-adapter.
Na koniec: commit (Conventional Commits), wpis do docs/ai-log/lead-collector.md, podsumowanie co sprawdzić ręcznie.
```
