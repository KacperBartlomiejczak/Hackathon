# 5 · Osoba #5 — dashboard (web)

**Branch:** `team/web` (stały, nie zmieniasz)
**Odpowiadasz za:** `web/` (React + Vite + TS, shadcn/ui, Recharts, socket.io-client, TanStack Query).
**Nie dotykasz:** reszty repo. Brakuje endpointu albo pola → piszesz do #4.
**Dajesz:** wszystko, co jury zobaczy na demo. UI po polsku, czysta konsola w przeglądarce.
**Czekasz na:** API (#4) — do tego czasu pracujesz na mockach zgodnych z `docs/contracts.md`.

## Zadania
### 14:30–15:30
- [ ] Szkielet `web/` (Vite, TS strict, shadcn, routing, layout z menu: Findingi / Trendy / Kalibracja / Źródła), Dockerfile.
- [ ] Typy w `web/src/types` przepisane z contracts + mocki w `web/src/mocks`.

### 15:30–19:00
- [ ] Lista findingów (tabela: data, moduł, ryzyko, źródło, firma, reklamujący, status) + paginacja.
- [ ] Szczegóły findingu: treść, URL, screenshot, **cytaty z uzasadnieniem** (najważniejszy ekran demo).
- [ ] Przełączenie z mocków na API.
**DoD 19:00:** prawdziwy finding widoczny w UI.

### 20:00–00:00
- [ ] Filtry: data, źródło, poziom ryzyka, moduł, status, wyszukiwarka.
- [ ] Wykres trendu incydentów w czasie (Recharts) + kafelki z `/stats/summary`.
- [ ] Toasty `alert:new` na żywo + licznik nowych; aktualizacja listy po `finding:updated`.
- [ ] Zmiana statusu z poziomu szczegółów + historia.

### 00:00–04:00
- [ ] **Panel kalibracji**: suwak progu per moduł → na żywo precision, recall, FP, FN (z `/eval`) + liczba wyników; „Zapisz próg” → `PUT /settings`.
- [ ] Ekran Źródła: lista, status ostatniego crawla, przycisk „Uruchom crawl”.
- [ ] Eksport CSV/JSON z aktualnymi filtrami.

### 04:00–10:30
- [ ] Czysta konsola (0 błędów i warningów, także klucze w listach), stany ładowania i pustych list, RWD na projektorze.
- [ ] Screenshoty ekranów do prezentacji dla #6.

## Twój agent (Claude Code)
**Rola:** buduje komponenty, hooki zapytań, wykresy, obsługę socketów; używa skilla `frontend-design` (z konta Kacpra, jeśli masz) do spójnego wyglądu oraz `dependency-guard`.
**Ty decydujesz i sprawdzasz:** flow demo z perspektywy jury (czy w 3 kliknięcia widać uzasadnienie flagi), czytelność, konsolę przeglądarki.

Prompt startowy:
```
Jesteś agentem brancha team/web. Przeczytaj CLAUDE.md, docs/team/5-web.md i docs/contracts.md.
Pracujesz tylko w web/. Nie zmieniaj brancha. Brak pola/endpointu w API → zatrzymaj się i wypisz, co mam zgłosić osobie od api.
Zadanie: <wklej>. Komponenty przez propsy, bez console.log, UI po polsku.
Na koniec: commit, wpis do docs/ai-log/web.md, co sprawdzić ręcznie w przeglądarce.
```
