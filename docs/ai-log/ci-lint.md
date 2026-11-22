# AI log — ci-lint (pat-dem, issue #110)

## 2026-11-22 — lint w CI dla api i collector
- Zlecono: issue #110, część 1: uruchamiać `npm run lint` w CI dla `api` i `collector`, żeby `console.log` w `src/` zatrzymał PR. Branch spoza tabeli „Zespół i branche”: asystent się zatrzymał i pokazał plan, człowiek zaakceptował pracę na tym worktree z PR do `main` (tak jak #111 i #112); `.github/` blokuje hook `team/api`, stąd ten tryb. Osoba #6 wie o zmianie.
- Zrobione: krok `Lint` w joba `node` w `.github/workflows/ci.yml` (`if: matrix.service != 'web'`, przed buildem).
- Skille: brak nowych paczek, więc bez `dependency-guard`.
- Weryfikacja: `npm run lint` w `api` i `collector` jest zielony na `main`. Tymczasowy plik z `console.log` w `src/` daje exit 1 w obu. Nie sprawdzone: zachowanie na GitHub Actions (wyjdzie dopiero na CI tego PR).
- Poza zakresem: `web` nie ma ESLint (część 2 #110) — zadanie dla team/web, nowa zależność przez `dependency-guard`.
- Wymaga akceptu infra (`.github/workflows/ci.yml`).
