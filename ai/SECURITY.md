# ai — skany bezpieczeństwa

## 2026-11-21 — szkielet
`uv export --no-dev --no-hashes > req.txt && uvx pip-audit==2.10.1 -r req.txt --disable-pip --no-deps`
Wynik: **No known vulnerabilities found** (wszystkie zależności runtime z `uv.lock`).
