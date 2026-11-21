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
- W Dockerfile nie ma `ENV`/`ARG` z sekretem.
- Grep w `web/` (bez `node_modules` i `dist`, bez `package-lock.json`) na wzorce `api_key|secret|password|token=` (bez rozróżniania wielkości liter), 2026-11-21: wynik pusty (brak trafień).
