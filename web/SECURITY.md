# Bezpieczeństwo – web

Data skanu: 2026-11-21
Środowisko: Node v26.13.1, npm 11.20.0
Zgodnie z `.claude/skills/dependency-guard/SKILL.md`.

## npm audit

Polecenie: `npm audit --audit-level=high` (w `web/`)

```
found 0 vulnerabilities
```

Kod wyjścia: 0.

Polecenie: `npm audit` (pełny)

```
found 0 vulnerabilities
```

Kod wyjścia: 0.

Wynik: 0 podatności (critical 0, high 0, moderate 0, low 0).

## Sekrety

- W `web/` nie ma sekretów.
- Konfiguracja wyłącznie przez `VITE_API_URL` i `VITE_USE_MOCKS`. Są to wartości publiczne (trafiają do bundla), nie sekrety.
- Opcjonalny `VITE_ADMIN_TOKEN` (issue #71) jest dołączany jako `Authorization: Bearer` do `PUT /settings`, `PATCH /findings/:id/status` i `POST /sources/:id/run`. Trafia do bundla, więc każdy, kto otworzy stronę, może go odczytać. To prosta blokada dla demo on-premise, a nie ochrona przed użytkownikiem panelu. Egzekwuje ją api, a przy 401/403 web pokazuje komunikat o braku uprawnień.
- W Dockerfile nie ma `ENV`/`ARG` z sekretem.
- Grep w `web/` (bez `node_modules` i `dist`, bez `package-lock.json`) na wzorce `api_key|secret|password|token=` (bez rozróżniania wielkości liter), 2026-11-21: wynik pusty (brak trafień).

## Obrazy bazowe (`web/Dockerfile`)

Data skanu: 2026-11-21
Narzędzie: Trivy 0.76.2 (`docker run --rm aquasec/trivy:0.76.2 image --severity CRITICAL,HIGH --scanners vuln <obraz>`).
Docker Scout wymaga konta Docker, którego zespół web nie ma, więc liczby nie pochodzą ze Scouta. Obie bazy podatności różnią się, dlatego wyniki nie są wprost porównywalne z pierwotnym raportem Scout (node:22.12-alpine: 10 krytycznych / 75 wysokich, nginx:1.27.5-alpine: 18 krytycznych / 68 wysokich). Skan Scoutem do powtórzenia przez osobę z kontem.

| Obraz | Rola | CRITICAL | HIGH |
|---|---|---|---|
| `node:22.12-alpine` (stary) | build | 4 | 55 |
| `node:22.23.5-alpine` (nowy) | build | 0 | 10 |
| `nginx:1.27.5-alpine` (stary) | runtime | 3 | 67 |
| `nginx:1.30.7-alpine` (nowy) | runtime | 0 | 1 |

Pozostałe podatności w nowych obrazach:
- `nginx:1.30.7-alpine`: 1 HIGH, `libxml2 2.13.9-r2` (CVE-2026-86144), poprawka w `2.13.9-r3` (pakiet Alpine, bez nowszego tagu nginx na dziś).
- `node:22.23.5-alpine`: 10 HIGH, wszystkie w pakietach dołączonych do samego `npm` (`/usr/local/lib/node_modules/npm/…`: brace-expansion, ip-address, pacote, picomatch, sigstore). Obraz służy tylko do `npm ci` i `npm run build` (stage `build`) i nie trafia do obrazu końcowego. Obraz runtime to nginx ze statycznym `dist`, bez Node.

Zmiana: node `22.12-alpine` → `22.23.5-alpine` (ta sama wersja Node co `api` i `collector`), nginx `1.27.5-alpine` → `1.30.7-alpine` (gałąź stable). Tagi przypięte, bez `latest`.

Sprawdzono po zmianie: `docker compose ps web` pokazuje `healthy`, `nginx -v` zwraca 1.30.7, a `/`, `/findings`, `/trends`, `/calibration` i `/sources` zwracają 200 z aplikacją (routing SPA po odświeżeniu działa).
