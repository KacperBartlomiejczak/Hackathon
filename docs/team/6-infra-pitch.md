# 6 · Osoba #6 — infra, bezpieczeństwo, dokumentacja, pitch

**Branch:** `team/infra` (stały, nie zmieniasz)
**Odpowiadasz za:** `docker-compose.yml`, `infra/` (bez `infra/db/`), `.env.example`, `.gitignore`, `README.md`, `PLAN.md`, `docs/` (bez `contracts.md`, `team/` i cudzych plików w `ai-log/`), `presentation/`, film.
**Nie dotykasz:** kodu serwisów i ich Dockerfile'i (należą do właścicieli serwisów).
**Dajesz innym:** compose, który odpala cały stos jedną komendą (**15:30 — blokuje zespół**), skany bezpieczeństwa, README, prezentację PDF, film ≤ 3 min, scalony `AI_PROCESS.md`.
**Czekasz na:** Dockerfile każdego serwisu od właścicieli (do 17:30).

## Zadania
### 14:30–15:30 — pilne
- [ ] `docker-compose.yml`: postgres (pgvector, PG16), valkey 8, seaweedfs (S3), ollama (+ GPU, jeśli dostępne), oraz wpisy dla `collector`, `api`, `ai`, `web` (build z ich katalogów). Wersje przypięte, healthchecki, wolumeny, init SQL z `infra/db/`.
- [ ] `.env.example` z opisem każdej zmiennej, `.gitignore` (`.env`, dane z pendrive'a, `node_modules`, `.venv`).
- [ ] Idź po dane do stoiska UKNF; zapytaj mentorów o **załącznik z wymogami M2** i czy dane można trzymać w repo.
**DoD 15:30:** `docker compose up` stawia infrastrukturę; serwisy dołączają, gdy pojawią się Dockerfile'e.

### 15:30–19:00
- [ ] Bucket S3 tworzony automatycznie (init container), pull modeli Ollamy w entrypoincie albo w osobnym jobie compose.
- [ ] Pierwsze skany (`npm audit` ×3, `pip-audit`) — wyniki do zespołu.
- [ ] Szkielet prezentacji (≤ 12 slajdów): problem, architektura, 3 moduły, kalibracja, bezpieczeństwo, proces AI, demo, dalszy rozwój.
- [ ] 19:00: prowadzisz `demo-check` na swoim laptopie.

### 20:00–00:00
- [ ] Diagram architektury (do README i na slajd).
- [ ] Sekcja „Proces AI” prezentacji: `CLAUDE.md`, skille, hook branchy, logi — z prawdziwymi przykładami z `docs/ai-log/`.
- [ ] Skrypt demo (kto klika, co mówi, ile sekund).

### 00:00–04:00
- [ ] `docs/SECURITY.md` (scalone z `<serwis>/SECURITY.md`) + `docs/DEPENDENCIES.md` z licencjami (scalone z `<serwis>/DEPENDENCIES.md`).
- [ ] 03:45: `demo-check` od czystego startu (`down -v`) na drugim laptopie.

### 04:00–10:30
- [ ] README: Quick Start, wymagania sprzętowe (RAM, VRAM/CPU dla Ollamy, miejsce na modele), opis serwisów i konfiguracji — krótko.
- [ ] Scal `docs/ai-log/*.md` do `docs/AI_PROCESS.md`.
- [ ] Nagranie filmu ≤ 3 min (na stabilnym seedzie), eksport prezentacji do PDF.
- [ ] 10:30 z Kacprem: wysłanie zgłoszenia.

## Twój agent (Claude Code)
**Rola:** pisze compose, healthchecki, skrypty init, szkic README i treść slajdów, scala logi i raporty bezpieczeństwa. Skille: `dependency-guard`, `demo-check`.
**Ty decydujesz i sprawdzasz:** czy stos naprawdę wstaje od zera na obcej maszynie, czy README nie jest „AI slopem” (krótko, konkretnie), finalny wygląd prezentacji.

Prompt startowy:
```
Jesteś agentem brancha team/infra. Przeczytaj CLAUDE.md, docs/team/6-infra-pitch.md i docs/contracts.md.
Pracujesz tylko w: docker-compose.yml, infra/ (bez infra/db/), .env.example, .gitignore, README.md, PLAN.md, docs/ (bez contracts.md i team/), presentation/.
Nie edytuj Dockerfile'i serwisów — jeśli coś w nich przeszkadza, wypisz, co mam zgłosić właścicielowi. Nie zmieniaj brancha.
Zadanie: <wklej>. Obrazy z przypiętymi wersjami, sekrety tylko przez env_file.
Na koniec: commit, wpis do docs/ai-log/infra.md, co sprawdzić ręcznie.
```

Pomocnik: pat-dem (team/api), zadania przydziela Osoba #6.
