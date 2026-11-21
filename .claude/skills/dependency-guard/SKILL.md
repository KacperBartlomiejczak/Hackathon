---
name: dependency-guard
description: Use before adding, upgrading or removing any npm or Python package, Docker base image or Ollama model, and before each checkpoint when running the security scans required by the UKNF jury.
---

# Bezpieczeństwo łańcucha dostaw (wymóg jury UKNF)

## Przed dodaniem paczki
1. Czy naprawdę potrzebna? Najpierw sprawdź, czy wystarczy stdlib albo coś, co już mamy.
2. Sprawdź paczkę w bazie podatności (Snyk Advisor / OSV) **przed instalacją**: popularność, ostatnie wydanie (< 12 mies.), znane CVE, licencja.
3. Licencja musi być open source i pozwalać na przekazanie praw UKNF: MIT, Apache-2.0, BSD, ISC, MPL-2.0 OK. **GPL/AGPL — pytaj leada.**
4. Instaluj z przypiętą wersją (`npm i pkg@x.y.z`, `uv add pkg==x.y.z`). Lockfile commitujemy.
5. Dopisz wiersz do `<serwis>/DEPENDENCIES.md` (własny plik serwisu, nie wspólny): `| paczka | wersja | licencja | po co |`. Osoba #6 scala je rano do `docs/DEPENDENCIES.md`.

## Skany (przed każdym checkpointem i przed oddaniem)
```bash
# w każdym serwisie Node (collector, api, web)
npm audit --audit-level=high        # high/critical = do naprawy: npm audit fix albo inna wersja
# ai/
uv run pip-audit
# opcjonalnie, jeśli ktoś ma konto
snyk test --all-projects
```
Wynik wklej do `<serwis>/SECURITY.md` z datą. Osoba #6 scala wszystko do `docs/SECURITY.md` dla jury.

## Sekrety
- Tylko w `.env` (w `.gitignore`). W repo jest `.env.example` z pustymi wartościami i opisem.
- Przed commitem: `git diff --cached | grep -iE "(api_key|secret|password|token)="` musi być puste.
- Docker: sekrety przez `env_file`, nigdy `ARG`/`ENV` z wartością w Dockerfile.

## Obrazy i modele
- Obrazy Docker z przypiętym tagiem (nie `latest`), oficjalne lub zweryfikowane.
- Modele Ollama: dokładny tag i licencję modelu zapisuje ai-core w `ai/DEPENDENCIES.md`.
