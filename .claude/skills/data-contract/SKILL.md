---
name: data-contract
description: Use whenever a database table, column, shared JSON shape, REST endpoint or Socket.io event used by more than one service (collector, api, ai, web) is added or changed.
---

# Zmiana kontraktu między serwisami

Kontrakt łamie się po cichu: TS się kompiluje, Python startuje, a dane w środku są złe. Dlatego zmieniamy go zawsze w jednym commicie, w każdym miejscu naraz.

## Kto zmienia kontrakt
`docs/contracts.md` i `infra/db/` należą do brancha `team/api` (osoba #4). Inne branche **nie edytują** tych plików:
1. Napisz do #4 na kanale: „zmiana kontraktu: <co>, dotyczy: <serwisy>”.
2. #4 robi zmianę na `team/api` i wystawia mały PR poza kolejką, a lead merguje go od razu.
3. Wszyscy robią `git fetch origin && git merge origin/main` i aktualizują typy **we własnym serwisie**.

## Checklista dla #4 (w jednym PR-ze)
1. `docs/contracts.md` — najpierw opis zmiany (to źródło prawdy).
2. Migracja SQL: `infra/db/migrations/NNN_<opis>.sql` (tylko dodawanie kolumn z DEFAULT/NULL — bez zmiany nazw w trakcie hackathonu).
3. Drizzle schema w `api/src/db/schema.ts`.
4. Walidacja `zod` na wejściu endpointu w `api/`.
5. W opisie PR-a lista do zaktualizowania przez innych: `collector/src/types` (lead), `ai/app/models.py` (ai-core), `web/src/types` (web).
6. Po merge'u każdy właściciel aktualizuje swoje typy na swoim branchu i sprawdza przepływ crawl → finding → dashboard.

## Zasady
- Nazwy w DB `snake_case`, w JSON `camelCase` — mapowanie w warstwie api i ai, nigdzie indziej.
- Zmiana usuwająca albo przemianowująca pole po 22:00 w sobotę wymaga zgody leada (Kacper).
- Napisz na kanale zespołu: „zmiana kontraktu: <co>, dotyczy: <serwisy>”.
- Dopisz wpis do swojego `docs/ai-log/<branch>.md`, jeśli zmianę przygotował Claude.
