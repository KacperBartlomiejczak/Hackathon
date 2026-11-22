# Opis zgłoszeniowy projektu — InvestWatch (HackNation 2026 · zadanie UKNF)

> Plik gotowy do skopiowania w pola formularza zgłoszeniowego (Tytuł, Krótki abstrakt, Szczegółowy opis projektu).

---

## Tytuł projektu

**InvestWatch — lokalny system monitoringu i analizy ryzyka treści inwestycyjnych w polskim internecie (100% open-source & on-premise)**

---

## Krótki abstrakt (Elevator Pitch)

**InvestWatch** to zautomatyzowany system nadzoru rynku finansowego stworzony dla UKNF, który zbiera publikacje o instrumentach i usługach inwestycyjnych z polskich stron WWW, blogów, YouTube oraz próbek danych, a następnie analizuje je lokalnie przy użyciu polskiego modelu językowego **Bielik-11B** i wielojęzycznych embeddingów **`bge-m3`**. System wykrywa naruszenia w trzech obszarach: promocję podmiotów nadzorowanych przez finfluencerów i osoby trzecie (**M1**), brak lub nierzetelność informacji o ryzyku w materiałach firm inwestycyjnych (**M2**) oraz nielegalne doradztwo inwestycyjne podmiotów spoza rejestru KNF (**M3**). Każde znalezisko zawiera zweryfikowany, dosłowny cytat z tekstu oraz zrzut ekranu zabezpieczony w lokalnym magazynie S3, a analityk może na żywo kalibrować progi czułości (kompromis FP vs FN) i eksportować raporty CSV/JSON.

---

## Szczegółowy opis projektu

### 1. Problem i kontekst UKNF
Dynamiczny wzrost aktywności finfluencerów, agresywnych kampanii reklamowych obiecujących wysokie stopy zwrotu oraz podmiotów oferujących nielicencjonowane doradztwo inwestycyjne („shadow advisory”) sprawia, że ręczny przegląd treści w internecie nie skaluje się, a dowody naruszeń potrafią zniknąć w ciągu kilku godzin. Celem **InvestWatch** jest dostarczenie analitykom UKNF narzędzia działającego w pełni wewnątrz infrastruktury urzędu (**on-premise**, zero zewnętrznych API chmurowych), które automatycznie pobiera materiały, zabezpiecza dowody (surowy HTML + screenshot) i wskazuje tylko te publikacje, w których model oraz reguły potrafią przytoczyć konkretny cytat dowodzący naruszenia.

### 2. Architektura i stos technologiczny (jedna komenda `docker compose up --build`)
System składa się z czterech lekkich serwisów aplikacyjnych oraz czterech usług infrastrukturalnych na czystych, permisywnych licencjach (pozwalających na pełne przejęcie praw majątkowych przez UKNF):
- **`collector` (Node 22 + TypeScript + Playwright + BullMQ):** odpowiada za cykliczne (`sources.cron`) i ręczne pobieranie treści przez adaptery `sample` (próbki offline), `web` (Playwright z Chromium, discovery linków z głębokości 1, rotacja 23 User-Agentów i `PROXY_LIST`, limit 2 równoległych połączeń na domenę, jitter) oraz `youtube` (publiczne kanały RSS). Zapisuje surowy HTML i screenshot PNG w **SeaweedFS S3**, metadane w **PostgreSQL 16**, raportuje postęp przez `/internal/crawl-status` i zleca analizę w serwisie AI.
- **`ai` (Python 3.12 + FastAPI + Ollama):** realizuje pełny potok przetwarzania języka naturalnego i klasyfikacji ryzyka w oparciu o lokalny serwer **Ollama**.
- **`api` (Node 22 + TypeScript + Fastify + Drizzle + Socket.io):** udostępnia walidowane przez `zod` endpointy REST (filtrowanie z indeksami GIN `pg_trgm`, szczegóły znaleziska z 15-minutowym presigned URL do screenshota, zmiana statusu z blokadą `SELECT ... FOR UPDATE` i historią audytu, statystyki trendów, ustawienia wag i progów, proxy ewaluacji `/eval` oraz eksport CSV/JSON dostosowany do polskiego Excela) oraz powiadomienia real-time Socket.io (`alert:new`, `finding:updated`, `crawl:status`).
- **`web` (React 19 + Vite + TypeScript + Tailwind + Recharts, serwowany przez Nginx):** dashboard analityka w języku polskim, stylizowany na wzór instytucjonalny `knf.gov.pl`, z powiadomieniami toast na żywo, podglądem dowodów i panelem kalibracji.
- **Infrastruktura:** **PostgreSQL 16 + `pgvector` + `pg_trgm`** (dane relacyjne, wektory i wyszukiwanie pełnotekstowe), **Valkey 8** (licencja BSD-3 zamiast Redisa RSAL/SSPL), **SeaweedFS** z API S3 (Apache-2.0 zamiast MinIO AGPL) oraz **Ollama** z automatyczną inicjalizacją bucketa (`s3-init`) i modeli (`ollama-init`).

### 3. Preprocessing: czyszczenie, deduplikacja, tokenizacja i embeddingi
Każdy pobrany dokument przechodzi przez czteroetapowy potok preprocessingu w serwisie `ai`:
1. **Ekstrakcja tekstu (`trafilatura`):** usunięcie znaczników HTML, nawigacji i szumu do czystego tekstu (`text_clean`).
2. **Deduplikacja dwupoziomowa:** dokładna po skrócie SHA-256 (`content_hash`) oraz przybliżona po 64-bitowym `simhash` liczonym na 3-gramach słów (próg odległości Hamminga `6`, wyznaczony eksperymentalnie w testach integracyjnych na `pgvector`).
3. **Tokenizacja i embeddingi:**
   - *Tokenizacja leksykalno-fleksyjna:* podział tekstu na tokeny i zdania z obsługą polskich końcówek fleksyjnych (do 3 liter), granic słów dla krótkich skrótów (`XTB`, `ING`, `IG`, `XM`) oraz okien kontekstowych (±200 znaków) dla anchorów promocyjnych względem bazy 86 podmiotów z rejestru KNF (`entities.csv`).
   - *Embeddingi semantyczne:* wyliczenie 1024-wymiarowego wektora przez model **`bge-m3`** i zapis w kolumnie `vector(1024)` (`pgvector`) do porównywania podobieństwa kosinusowego ze wzorcowymi frazami doradztwa inwestycyjnego.

### 4. Uzasadnienie wyboru modeli: `Bielik-11B-v2.3-Instruct` i `bge-m3` (zamiast Gemma / BERT)
- **`SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M` zamiast `Gemma`:** Bielik (SpeakLeash / ACK Cyfronet AGH, licencja Apache-2.0) posiada natywny polski tokenizer i został wytrenowany na polskich korpusach tekstowych. Dzięki temu znacznie trafniej interpretuje polską fleksję, konstrukcje prawno-finansowe oraz perswazyjny język reklam inwestycyjnych niż ogólne modele wielojęzyczne (Gemma), zapewniając jednocześnie wysoką dyscyplinę zwracania ustrukturyzowanego JSON-a (`format` ze schematu Pydantic, `temperature: 0`).
- **`bge-m3` zamiast klasycznego `BERT`:** `bge-m3` (MIT) obsługuje kontekst do 8192 tokenów (16× więcej niż klasyczny BERT z limitem 512 tokenów), generuje wysokiej jakości wielojęzyczne wektory 1024-dim dla całych artykułów i transkrypcji oraz działa w tym samym lokalnym procesie Ollama.

### 5. Trzy moduły analityczne, scoring i kalibracja
- **M1 (Finfluencerzy i podmioty trzecie):** wykrywa treści wspominające licencjonowaną firmę inwestycyjną z rejestru KNF opublikowane z domeny lub konta spoza jej oficjalnych kanałów (`official_domains`, `social_handles`).
- **M2 (Informacja o ryzyku):** weryfikuje materiały na oficjalnych kanałach firm inwestycyjnych względem 4-punktowej checklisty (`risk_warning_present`, `risk_prominence`, `profit_risk_balance`, `no_guaranteed_returns`).
- **M3 (Shadow advisory):** identyfikuje podmioty spoza rejestru KNF oferujące doradztwo inwestycyjne lub zarządzanie portfelem (hybryda słownika reguł `rules/m3.yaml`, podobieństwa embeddingów `bge-m3` i oceny LLM).
- **Wiarygodność i kalibracja:** końcowy wynik `score = w_llm * llm + w_rules * rules + w_emb * emb` wymaga dosłownego cytatu zweryfikowanego w tekście źródłowym (`rapidfuzz.partial_ratio >= 90` — zasada *„bez cytatu nie ma flagi”*). W panelu kalibracji analityk przesuwa suwak progu i na żywo obserwuje `precision`, `recall`, `TP`, `FP`, `FN`, `TN` wyliczane przez `GET /eval` na zbiorze kontrolnym `gold.csv`.

### 6. Bezpieczeństwo i standaryzowany proces pracy z AI
- **Bezpieczeństwo (`docs/SECURITY.md`, `docs/DEPENDENCIES.md`):** brak twardo zakodowanych sekretów (`.env` w `.gitignore`, walidacja `zod` przy starcie), kontenery non-root (`api`, `collector`, `ai`), ochrona `/internal/*` przez `X-Internal-Token` (`timingSafeEqual` na SHA-256), maskowanie sekretów w logach `pino`, ochrona przed CSV formula injection oraz separacja nieufnej treści `<document>` w promptach LLM. Zależności przeszły audyty `npm audit`, `pip-audit` (0 podatności w paczkach aplikacji) oraz skan obrazów `docker scout quickview`.
- **Proces pracy z AI (`CLAUDE.md` + `docs/AI_PROCESS.md`):** zespół pracował w metodyce *plan-first* na 6 stałych branchach pilnowanych hookiem `.githooks/pre-commit` z 5 dedykowanymi skillami (`scraper-adapter`, `risk-classifier`, `data-contract`, `dependency-guard`, `demo-check`), prowadząc pełny dziennik weryfikacji i poprawek człowieka w `docs/AI_PROCESS.md`.
