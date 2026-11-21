---
name: demo-check
description: Use before every team checkpoint and before final submission — runs a clean-start smoke test of the whole stack, checks the jury's evaluation points and the submission package.
---

# Smoke test i gotowość do demo

## 1. Czysty start (symuluje maszynę jury)
```bash
docker compose down -v
cp .env.example .env            # tylko wartości domyślne!
docker compose up --build -d
docker compose ps               # wszystkie healthy
curl -s localhost:8000/health   # ollama: ok
curl -s localhost:3000/stats/summary
```
Jeśli cokolwiek wymaga ręcznego kroku spoza README → dopisz do README albo zautomatyzuj (init SQL, seed, pull modelu w entrypoincie).

## 2. Ścieżka demo (dokładnie to pokażemy jury)
- [ ] Odpalenie crawla z dashboardu (`/sources/:id/run`) → dokumenty pojawiają się na liście.
- [ ] Wysokie ryzyko → **toast Socket.io na żywo** bez odświeżania strony.
- [ ] Szczegóły findingu: firma, reklamujący, treść, URL, screenshot, **cytaty uzasadniające**.
- [ ] Filtry: data, źródło, poziom ryzyka, moduł — każdy działa.
- [ ] Wykres trendu incydentów w czasie.
- [ ] Zmiana statusu (new → in_review → confirmed/dismissed) + historia.
- [ ] **Panel kalibracji**: suwak progu zmienia precision/recall/FP/FN i liczbę wyników na liście.
- [ ] Eksport CSV/JSON raportu dla każdego modułu.

## 3. Punkty, które jury sprawdza wprost
- [ ] DevTools przeglądarki: **konsola czysta** (0 błędów/warningów), brak `console.log` w kodzie: `grep -rn "console.log" --include=*.ts --include=*.tsx collector api web` = pusto (poza loggerem).
- [ ] `grep -rn "print(" ai/app` = pusto.
- [ ] Skany z `dependency-guard` aktualne, wynik w `docs/SECURITY.md`.
- [ ] Brak sekretów w repo, jest `.env.example`.
- [ ] Wszystkie obrazy z przypiętymi wersjami.

## 4. Paczka do oddania (do 10:30, deadline 11:00)
- [ ] Repozytorium (link działa dla jury).
- [ ] README: Quick Start, wymagania sprzętowe (RAM, GPU/CPU dla Ollamy, dysk na modele), opis serwisów i konfiguracji. Krótko.
- [ ] Opis projektu + tytuł.
- [ ] Prezentacja PDF (architektura, 3 moduły, kalibracja, bezpieczeństwo, proces AI z `docs/AI_PROCESS.md`).
- [ ] Film ≤ 3 min (opcjonalny, ale róbcie).

Wynik checklisty wklej na kanał zespołu: co ✅, co ❌, kto naprawia.
