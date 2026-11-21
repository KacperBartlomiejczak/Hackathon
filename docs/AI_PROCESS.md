# Proces tworzenia oprogramowania z asystentem AI

Standard zespołu:
- `CLAUDE.md` w katalogu głównym — kontekst projektu, zasady, właściciele, priorytety hackathonu.
- Skille w `.claude/skills/`: `scraper-adapter`, `risk-classifier`, `data-contract`, `dependency-guard`, `demo-check`.
- Każdy kod od AI przechodzi przegląd człowieka przed merge'em; zależności tylko przez `dependency-guard`.

## Log
Każdy prowadzi własny plik `docs/ai-log/<branch>.md` (ta sama tabela). Osoba #6 scala je tutaj w niedzielę rano.

| Czas | Kto | Zadanie zlecone AI | Skill | Co zweryfikował / poprawił człowiek |
|---|---|---|---|---|
| 21.11 15:00 | Kacper | szkielet adaptera `sample` | scraper-adapter | poprawione mapowanie pól z danych UKNF |
