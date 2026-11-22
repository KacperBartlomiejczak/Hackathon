# Scenariusz demo i nagrania wideo — InvestWatch (0:00–3:00)

Cel: zmieścić cały przepływ end-to-end w **≤ 3 minuty** (180 sekund), pokazując wymagania jury UKNF: lokalne modele, 3 moduły (M1/M2/M3) z cytatami i screenshotem, alert Socket.io na żywo, panel kalibracji (FP vs FN), zmianę statusu, eksport oraz architekturę i proces AI.

## Warunki wstępne przed nagraniem (T−5 min)
- Czysty start: `docker compose down -v && cp .env.example .env && docker compose up --build -d`
- Zweryfikowane `docker compose ps` (wszystkie kontenery `healthy`), `curl -s http://localhost:8000/health` (`ollama: ok`), `curl -s http://localhost:3000/health`.
- Otwarte 2 okna do przełączania (lub split):
  1. Przeglądarka na `http://localhost:5173` (z otwartym lub gotowym do pokazania DevTools → Console, zero błędów/warningów).
  2. Terminal z podglądem `docker compose ps` / `presentation/slides.md`.

---

## Przebieg krok po kroku (0:00–3:00)

| Czas | Co widać na ekranie | Kto klika / akcja | Co dokładnie mówi narrator |
|---|---|---|---|
| **0:00–0:20** | Terminal z `docker compose ps` (`healthy`), następnie przełączenie na pustą/startową listę w `http://localhost:5173` (zakładka **Findingi**). | **Osoba #6** przełącza okno z terminala na przeglądarkę. | „Cześć, prezentujemy **InvestWatch** — system monitoringu treści inwestycyjnych dla UKNF, działający w 100% on-premise na otwartych komponentach. Cały stos wstaje jedną komendą `docker compose up`: PostgreSQL z pgvector, Valkey, SeaweedFS S3, lokalna Ollama z Bielikiem 11B i bge-m3 oraz serwisy collector, api, ai i dashboard.” |
| **0:20–0:45** | Zakładka **Źródła** w dashboardzie — tabela skonfigurowanych źródeł (w tym źródło `sample` / strona WWW). Po kliknięciu widoczny status `running` z `crawl:status`. | **Kacper** klika zakładkę **Źródła**, a następnie przycisk **„Uruchom crawl”** przy pierwszym źródle. | „Zaczynamy od ręcznego wyzwolenia crawla z poziomu panelu. API wysyła zadanie do kolejki BullMQ w Valkey, `collector` pobiera treść i robi screenshot przez Playwrighta, odkłada surowe pliki do SeaweedFS S3 i przekazuje dokument do serwisu AI.” |
| **0:45–1:15** | Powrót do zakładki **Findingi**. W prawym rogu ekranu pojawia się bez odświeżania strony **toast Socket.io `alert:new`** dla znaleziska `high`. Na liście wpadają nowe rekordy. | **Kacper** wraca na **Findingi** i klika powiadomienie (lub nowy wiersz o wysokim ryzyku dla **M2**). | „W tle Pythonowy serwis AI czyści tekst, deduplikuje go przez SHA-256 i simhash, wylicza embedding `bge-m3` i analizuje lokalnym Bielikiem. Gdy wynik przekracza próg `0.8`, backend emituje zdarzenie `alert:new` przez Socket.io i analityk dostaje natychmiastowe powiadomienie na żywo.” |
| **1:15–1:45** | Ekran **Szczegóły findingu** (M2 — informacja o ryzyku): ocena kryteriów z checklisty M2 (np. `risk_warning_present`, `risk_prominence`, `profit_risk_balance`, `no_guaranteed_returns`, `past_performance_disclaimer`, `leverage_loss_warning`), **dosłowne cytaty** wyciągnięte z treści oraz **podgląd screenshota** z S3. | **Kacper** przewija kartę kryteriów i pokazuje screenshot z presigned URL. | „W szczegółach znaleziska nie mamy czarnej skrzynki. Przy każdym kryterium z checklisty opartej na rozporządzeniu 2017/565 i załączniku UKNF system pokazuje werdykt oraz dosłowny cytat zweryfikowany w tekście źródłowym, obok pełnego screenshota z S3. Bez prawdziwego cytatu z dokumentu flaga nie powstaje.” |
| **1:45–2:10** | Zakładka **Findingi** — szybkie filtrowanie po module (**M1** finfluencerzy oraz **M3** shadow advisory), pokazanie firmy z rejestru KNF vs podmiotu publikującego spoza jej oficjalnych domen oraz śledzenia `first_seen_at` / `last_seen_at` / `isActive` (i agregatora `/documents`). | **Kacper** wybiera filtr modułu M1, wskazuje wynik (firma + reklamujący + URL), potem filtr M3. | „Obok modułu M2 działają równolegle dwa kolejne: **M1** wyłapuje promocję licencjonowanych firm prowadzoną przez finfluencerów spoza oficjalnych domen rejestru KNF i śledzi czas trwania kampanii, a **M3** wykrywa nielicencjonowane doradztwo wg art. 76 na bazie reguł, embeddingów i LLM.” |
| **2:10–2:35** | Zakładka **Kalibracja** — przesunięcie suwaka progu dla wybranego modułu (np. z `0.60` na `0.75`): na żywo aktualizują się `precision`, `recall`, `FP`, `FN` oraz licznik „Oznaczone flagą” na zbiorze `gold.csv`, po czym wracamy na **Szczegóły** / **Trendy** i zmieniamy status na `confirmed` + klikamy **Eksport CSV**. | **Kacper** przesuwa suwak progu w **Kalibracji**, pokazuje spadek `FP` i wzrost `FN`, potem zmienia status i pobiera CSV. | „W panelu kalibracji analityk stroi próg decyzji na ręcznie oznaczonym zbiorze walidacyjnym — od razu widać kompromis między false positives a false negatives. Gotową sprawę potwierdzamy z pełną historią audytu i eksportujemy raport CSV.” |
| **2:35–3:00** | Zakładka **Trendy** (kafelki i wykres Recharts) oraz krótkie mignięcie slajdu **Proces AI** / `CLAUDE.md` + czysta konsola DevTools (0 błędów). | **Osoba #6** pokazuje wykres trendów, konsolę DevTools i slajd 9 („Proces pracy z AI”). | „Na koniec widok trendów i czysta konsola bez błędów. Cały projekt powstał w rygorze `CLAUDE.md` — z podziałem na 6 stałych branchy pilnowanych hookiem `pre-commit`, skillem `dependency-guard` oraz walidacją konfiguracji i zerową liczbą podatności w skanach. Dziękujemy!” |

---

## Zasady awaryjne na wypadek problemów w trakcie demo (Plan B)
- Jeśli sieć lub zewnętrzne strony blokują Playwrighta → w zakładce **Źródła** uruchamiamy wyłącznie źródło `sample` (dane offline wbudowane w obraz `collector`).
- Jeśli model LLM odpowiada wolniej na CPU → nie przełączamy się na żadne API chmurowe; pokazujemy działające wyniki z kolejki i walidację cytatów na już przetworzonych dokumentach w bazie.
- Przed wejściem na scenę upewnić się, że w oknie przeglądarki nie ma otwartych przestarzałych kart i konsola DevTools jest czysta.
