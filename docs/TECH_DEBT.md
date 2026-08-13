# TECH DEBT

Audyt wykonany 2026-08-13 na commicie `3edf8a9`. **W repozytorium nie ma ani
jednego komentarza `TODO`/`FIXME`/`HACK`** — poniższa lista powstała z analizy
kodu, nie z markerów. Nic z tej listy nie zostało w ramach audytu naprawione
(zadanie było „dokumentuj, nie refaktoruj”).

Severity: `low` / `medium` / `high` / `critical`.

---

### TD-001 — Martwy endpoint i nieużywany kod serwowania pytań
- **Severity:** low
- **Area:** Architecture / Code quality
- **Problem:** Po przejściu na prefetch (ADR-005) endpoint
  `GET /api/quiz/sessions/[id]/questions/[seq]` oraz `serveQuestion()`,
  `serve()` i typ `ServedQuestion` nie są wywoływane z żadnego miejsca
  w aplikacji.
- **Evidence:** `src/app/api/quiz/sessions/[id]/questions/[seq]/route.ts`,
  `src/lib/quiz/service.ts` (`serveQuestion`, `serve`, `ServedQuestion`);
  brak referencji w `src/components/**`.
- **Impact:** Nowy agent może rozbudować martwą ścieżkę; endpoint zwiększa
  powierzchnię API (choć wymaga sesji użytkownika).
- **Suggested solution:** Usunąć endpoint i funkcje albo oznaczyć w kodzie
  jako deprecated z komentarzem wskazującym `serveBatch()`.

### TD-002 — Trzy wersje `submit_answer` rozrzucone po migracjach
- **Severity:** medium
- **Area:** Architecture (baza)
- **Problem:** Ta sama funkcja jest definiowana `create or replace` w `0003`,
  `0006` i `0009`. Aby zrozumieć aktualne reguły, trzeba wiedzieć, że
  obowiązuje `0009`; przy wykonaniu migracji w złej kolejności można cofnąć
  logikę (np. usunąć limit czasu).
- **Evidence:** `supabase/migrations/0003_quiz.sql:184`,
  `0006_prefetch.sql:8`, `0009_time_limit.sql:10`.
- **Impact:** Ryzyko regresji przy ręcznym wykonywaniu migracji
  (a taki jest proces — ADR-011); utrudniony przegląd reguł gry.
- **Suggested solution:** Utrzymywać „bieżącą” definicję w jednym pliku
  (np. `supabase/functions.sql` wykonywanym po migracjach) albo dopisać na
  początku każdej starszej wersji komentarz „SUPERSEDED BY 00NN”.

### TD-003 — Formuły gry zduplikowane TS ↔ SQL
- **Severity:** medium
- **Area:** Architecture
- **Problem:** XP, rangi, streak i limity czasu istnieją równolegle w
  `src/lib/engine/{xp,streak,types}.ts` i w migracjach `0003`/`0004`/`0009`.
  Rozjazd nie jest wykrywany automatycznie poza tym, co sprawdza `smoke.sql`
  (np. progi rang i tabela `RANKS` nie są porównywane).
- **Evidence:** `src/lib/engine/xp.ts` (komentarz „MUSI być zgodne”),
  `supabase/migrations/0004_gamification.sql` (`rank_index`, `finish_session`),
  `AGENTS.md` zasada 2.
- **Impact:** UI może pokazywać inną rangę/XP niż baza przyznaje.
- **Suggested solution:** Test kontraktowy w `smoke.sql` porównujący
  `rank_index()` z progami z `RANKS` (np. tabela wartości oczekiwanych
  generowana z TS) lub przeniesienie progów do tabeli w bazie i czytanie ich
  przez silnik.

### TD-004 — Brak CI
- **Severity:** high
- **Area:** Developer experience / Testing
- **Problem:** Nie ma workflow uruchamiającego testy, lint, typecheck ani
  build. Jedyne workflowy to `workflow_dispatch` do importu danych i nadawania
  roli. Regresję łapie wyłącznie dyscyplina agenta.
- **Evidence:** `.github/workflows/` (`import-danych.yml`, `role-admina.yml`).
- **Impact:** Możliwy push kodu, który nie kompiluje się lub łamie testy
  (zdarzyło się: commit `b6b7f2b` naprawiał błąd lintera wypchnięty wcześniej).
- **Suggested solution:** Workflow na `push`/`pull_request`:
  `npm ci && npm test && npm run lint && npm run typecheck && npm run build`
  (opcjonalnie `./scripts/db-test.sh` na obrazie z PostgreSQL).

### TD-005 — Zero testów UI, w tym najbardziej złożonego pliku
- **Severity:** high
- **Area:** Testing
- **Problem:** `src/components/quiz/game.tsx` (581 linii) zawiera timer,
  auto-oddawanie odpowiedzi, prefetch, beacon, dogrywkę wyzwania, bottom-sheet
  i wznowienie sesji — **bez żadnych testów**. Brak testów komponentów,
  server actions, route handlerów i e2e.
- **Evidence:** brak plików `*.test.tsx`; `vitest.config.ts` (`environment: node`,
  wzorce tylko `*.test.ts`).
- **Impact:** Regresje wychodzą u użytkownika; dwie rundy zgłoszeń dotyczyły
  właśnie zachowania tego ekranu.
- **Suggested solution:** Testy jednostkowe wydzielonej logiki timera/kolejki
  pytań (bez DOM) + minimalny zestaw e2e (Playwright) na przepływ „start sesji
  → odpowiedź → wynik” na danych z `seed-placeholder`.

### TD-006 — Ręczny proces migracji bez rejestru stanu
- **Severity:** high
- **Area:** Architecture / Operations
- **Problem:** Migracje wykonuje człowiek w SQL Editorze (ADR-011), a repo nie
  ma żadnego zapisu, które z nich są już na produkcji. Kod broni się
  fallbackami, ale funkcje po prostu „nie działają” do czasu wklejenia.
- **Evidence:** README sekcja 1; fallbacki na `42P01`/`42703`
  (`src/lib/db/settings.ts`, `src/lib/db/catalog.ts`);
  `mapDbError` → `migration_required` (`src/lib/quiz/service.ts`).
- **Impact:** Trudno stwierdzić, czy błąd to bug, czy brak migracji;
  ryzyko pominięcia migracji na długo.
- **Suggested solution:** Tabela `schema_migrations` (nazwa pliku + data)
  wypełniana na końcu każdej migracji + strona diagnostyczna w panelu admina
  („wykonane migracje / brakujące”).

### TD-007 — Brak obserwowalności
- **Severity:** medium
- **Area:** Operations
- **Problem:** Jedyne logowanie błędów to `console.error("API error:", e)`
  w `withApi()`. Brak korelacji żądań, brak Sentry/Logflare, brak metryk
  (np. ile sesji kończy się `abandoned`, ile odpowiedzi wpada w `timeout`).
- **Evidence:** `src/lib/api.ts:29` (jedyne `console.*` w `src/`).
- **Impact:** Problemy produkcyjne diagnozuje się z relacji użytkownika.
- **Suggested solution:** Podłączyć logger z identyfikatorem żądania i
  zewnętrzny sink; ewentualnie prosty widok w panelu admina na podstawie
  danych, które już są w bazie.

### TD-008 — Potwierdzenia oparte na `confirm()`/`prompt()`
- **Severity:** low
- **Area:** UX/UI
- **Problem:** Destrukcyjne akcje używają natywnych okien przeglądarki:
  przerwanie wyzwania, usunięcie pytania, usunięcie konta (przepisanie
  adresu przez `window.prompt`). Nie da się tego stylować, na iOS wygląda
  obco, brak dostępności.
- **Evidence:** `src/components/quiz/game.tsx:338`,
  `src/app/admin/pytania/row-actions.tsx:29`,
  `src/app/admin/uzytkownicy/delete-user-button.tsx:30`.
- **Impact:** Niespójny wygląd; ryzyko zablokowania dialogu przez przeglądarkę.
- **Suggested solution:** Własny komponent modala w `src/components/ui/`
  (konsekwencja ADR-010 — brak biblioteki dialogów).

### TD-009 — Cały katalog ładowany do pamięci na każdą sesję
- **Severity:** medium
- **Area:** Performance
- **Problem:** `loadCatalogSnapshot()` przy każdym starcie sesji (i każdej
  dogrywce wyzwania) pobiera **wszystkie** modele, cechy, teorię i pełną
  macierz `model_features` (~39 tys. wierszy = ~40 zapytań stronicowanych).
- **Evidence:** `src/lib/db/catalog.ts` (`fetchAll` + `loadCatalogSnapshot`),
  wywołania w `src/lib/quiz/service.ts` (`startSession`, `startDailySession`,
  `extendChallenge`).
- **Impact:** Rosnące opóźnienie startu sesji i obciążenie bazy wraz
  z katalogiem; przy większej liczbie równoczesnych graczy to główny koszt.
- **Suggested solution:** Cache snapshotu po stronie serwera z krótkim TTL
  (dane katalogowe zmieniają się rzadko — tylko przy imporcie) albo
  generowanie pytań w SQL zamiast w TS.

### TD-010 — Kolejność stron w `fetchAll` zależy od dyscypliny wywołującego
- **Severity:** medium
- **Area:** Code quality / Correctness
- **Problem:** `fetchAll()` wymaga stabilnego `ORDER BY`, ale nie potrafi tego
  wymusić — pominięcie sortowania da losowe/duplikujące się strony.
  Sygnalizuje to tylko komentarz.
- **Evidence:** `src/lib/db/catalog.ts` (komentarz „Wywołujący MUSI ustawić
  stabilny ORDER BY”).
- **Impact:** Cichy, trudny do zauważenia bug danych (dokładnie ten rodzaj,
  który już raz wystąpił — patrz ADR-014).
- **Suggested solution:** API wymuszające sortowanie (np. `fetchAll(table, {order: [...]})`)
  albo asercja w trybie dev, że zapytanie zawiera `order`.

### TD-011 — Pytania teoretyczne to szkice wygenerowane bez źródła
- **Severity:** medium
- **Area:** Product data
- **Problem:** 31 pytań w `materialy/teoria/pytania-teoria.json` powstało bez
  katalogu produktowego DRE; mogą zawierać nieścisłości merytoryczne, a są
  aktywne w puli.
- **Evidence:** `materialy/teoria/pytania-teoria.json`, `materialy/katalog/`
  (pusty), `docs/STATUS.md`.
- **Impact:** Ryzyko uczenia użytkowników błędnych treści.
- **Suggested solution:** Przegląd merytoryczny przez DRE; do tego czasu
  rozważyć `active = false` dla nieweryfikowanych wpisów.

### TD-012 — Brak pinowania wersji Node i konfiguracji deploymentu w repo
- **Severity:** low
- **Area:** Dependencies / DX
- **Problem:** `package.json` nie ma pola `engines`; nie ma `.nvmrc` ani
  `vercel.json`. Workflowy używają Node 22, ale lokalnie i na Vercelu wersja
  jest dowolna/domyślna.
- **Evidence:** `package.json`, `.github/workflows/*.yml` (`node-version: 22`),
  brak `vercel.json`/`.nvmrc`.
- **Impact:** Możliwe różnice zachowania build/runtime między środowiskami.
- **Suggested solution:** Dodać `engines.node` i `.nvmrc`; ustawienia Vercela
  udokumentować (są dziś tylko w panelu Vercela — poza repo).

### TD-013 — Brak weryfikacji kierunku prawe/lewe (założenie o danych)
- **Severity:** high
- **Area:** Product correctness
- **Problem:** Import przyjmuje, że oryginalne zdjęcia to skrzydła **prawe**
  (`--orientation right`). Jeśli założenie jest błędne, wszystkie odpowiedzi
  w kategorii „prawe/lewe” są odwrócone.
- **Evidence:** `scripts/import/photos.ts` (parametr `--orientation`),
  `.github/workflows/import-danych.yml` (input `orientacja`, default `right`),
  `door_models.original_orientation`.
- **Impact:** Cała kategoria pytań może uczyć odwrotnie.
- **Suggested solution:** Weryfikacja na kilku pytaniach na produkcji;
  naprawa = ponowny import z `orientacja: left` (bez zmian w kodzie).

### TD-014 — `next.config.ts` bez ustawień bezpieczeństwa
- **Severity:** low
- **Area:** Security
- **Problem:** Konfiguracja Next jest pusta — brak nagłówków
  bezpieczeństwa (CSP, `X-Frame-Options`, `Referrer-Policy`).
- **Evidence:** `next.config.ts` (`const nextConfig: NextConfig = {}`).
- **Impact:** Domyślne nagłówki Vercela; brak ochrony przed clickjackingiem
  i restrykcyjnej CSP dla aplikacji z tokenami w cookies.
- **Suggested solution:** Dodać `headers()` z podstawowym zestawem nagłówków
  (uwaga na signed URL-e do Storage i obrazki `img-src`).

### TD-015 — `AGENTS.md` i `docs/` mogą się rozjechać
- **Severity:** low
- **Area:** Documentation
- **Problem:** Po tym audycie te same inwarianty są opisane w `AGENTS.md`,
  `CLAUDE.md` i `docs/**`. Aktualizacja jednego miejsca bez pozostałych
  wprowadzi sprzeczność.
- **Evidence:** `AGENTS.md` (8 zasad) vs `CLAUDE.md` („Critical invariants”)
  vs `docs/ARCHITECTURE.md`.
- **Impact:** Nowy agent może zastosować nieaktualną regułę.
- **Suggested solution:** Traktować `CLAUDE.md` jako źródło prawdy dla reguł,
  a `AGENTS.md` skrócić do wskaźnika na `CLAUDE.md` (nie zrobione w tym
  audycie, by nie zmieniać ustalonego pliku bez zgody właściciela).
