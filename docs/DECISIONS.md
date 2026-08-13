# DECISIONS — Architecture Decision Log

Lekki ADR. Statusy: **Accepted** (decyzja jawnie zapisana w repo, np.
w `AGENTS.md`/komentarzu migracji), **Inferred** (wyprowadzona z kodu — nie
mam potwierdzenia intencji), **Proposed**, **Deprecated**.

---

## ADR-001: Poprawne odpowiedzi nigdy nie trafiają do klienta
Status: Accepted

### Context
Aplikacja szkoleniowa z rankingami (także firmowymi) — wynik ma znaczyć coś
realnego. Cała pula pytań pochodzi z danych, które da się podejrzeć w
narzędziach przeglądarki, jeśli wysłać je za wcześnie.

### Decision
Tabele z odpowiedziami mają RLS bez polityk (tylko service role). Do klienta
idzie `payload` bez `correctAnswer`. Werdykt liczy funkcja SQL `submit_answer`.
Ścieżki plików w Storage nie są ujawniane — tylko krótkie signed URL-e.

### Reason
Uczciwość rankingu; brak sensownego sposobu ukrycia odpowiedzi w kliencie.

### Consequences
Każda odpowiedź = jedno RPC (opóźnienie sieciowe). Zoptymalizowano to
prefetchem pytań i lokalnym narratorem (ADR-005), a nie wysyłaniem odpowiedzi
— propozycja „dosyłać poprawną odpowiedź z pytaniem” była rozważana i
**świadomie odrzucona**.

### Evidence
- `supabase/migrations/0002_catalog.sql` (RLS bez polityk)
- `supabase/migrations/0009_time_limit.sql` (`submit_answer`)
- `src/lib/quiz/service.ts` (`serveBatch` — payload bez odpowiedzi)
- `AGENTS.md` zasada 1

---

## ADR-002: Silnik quizu jako czysty TypeScript
Status: Accepted

### Context
Plan obejmuje przyszłą aplikację mobilną (Expo).

### Decision
`src/lib/engine/**` nie importuje Next/React/Supabase. Dane wchodzą jako
`CatalogSnapshot`, losowość jako wstrzykiwany `Rng`.

### Reason
Przenośność i testowalność bez środowiska przeglądarki/bazy.

### Consequences
Serwis (`src/lib/quiz/service.ts`) musi zebrać snapshot i wagi przed
generacją; silnik nie potrafi sam nic doczytać.

### Evidence
- `src/lib/engine/generators.ts`, `src/lib/engine/rng.ts`
- `vitest.config.ts` (`environment: node`)
- `AGENTS.md` zasada 3

---

## ADR-003: Autorytatywne reguły gry w SQL, lustro w TS
Status: Accepted

### Context
Punktacja musi być odporna na manipulację klientem, a jednocześnie UI musi
umieć pokazać rangi i postęp.

### Decision
XP, combo, streak, odznaki, misje, limity czasu liczy Postgres
(`submit_answer`, `finish_session`). `src/lib/engine/{xp,streak}.ts` to kopia
formuł do wyświetlania i testów — **musi być zgodna**.

### Reason
Bezpieczeństwo + transakcyjność (jedna transakcja = spójny stan).

### Consequences
Świadoma duplikacja logiki w dwóch językach → ryzyko rozjazdu; mitygacja:
zapis w `AGENTS.md`/`CLAUDE.md` i harness `./scripts/db-test.sh`.
Odnotowane jako dług (TD-003).

### Evidence
- `supabase/migrations/0004_gamification.sql`, `0009_time_limit.sql`
- `src/lib/engine/xp.ts` (komentarz nagłówkowy)
- `supabase/tests/smoke.sql` blok 4 (inwariant `total_xp`)

---

## ADR-004: RLS deny-by-default + service role po stronie serwera
Status: Accepted

### Decision
Każda tabela ma RLS włączony. Dane wrażliwe: zero polityk. Dane użytkownika:
polityka „tylko własne wiersze” na select; zapisy przez funkcje SQL lub
service role z warstwy `src/lib/db/*` (`import "server-only"`).

### Reason
Nawet wyciek klucza anon nie ujawnia pytań ani cudzych wyników.

### Consequences
Prawie każdy odczyt danych gry wymaga serwera (brak „client-side fetch”
z Supabase poza auth i rankingami).

### Evidence
- `supabase/migrations/0002…0012` (`enable row level security`)
- `src/lib/db/server.ts` (`createAdminClient`), `src/lib/db/*.ts` (`server-only`)

---

## ADR-005: Prefetch całej sesji + beacon „pytanie wyświetlone”
Status: Accepted

### Context
Pierwsza wersja pobierała pytanie po pytaniu — przejścia czekały na sieć,
UX na telefonie był wolny.

### Decision
Start sesji zwraca **wszystkie** payloady + zbiorczo podpisane URL-e obrazków.
Klient przechodzi między pytaniami lokalnie i preloaduje obrazki 4 w przód.
Pomiar czasu odpowiedzi startuje osobnym, lekkim żądaniem `POST …/served`.
Gdy beacon nie dojdzie przed odpowiedzią → brak bonusu za szybkość i brak
kary `too_fast`.

### Reason
Natychmiastowe przejścia bez ujawniania odpowiedzi (payload jest „bezpieczny”).

### Consequences
Potrzebna migracja `0006` tolerująca `served_at IS NULL`; dogrywka pytań
w wyzwaniu musiała dostać osobny endpoint (`…/extend`) wołany w tle.
Stary endpoint „pytanie na żądanie” został osierocony (TD-001).

### Evidence
- `src/lib/quiz/service.ts` (`serveBatch`, `finalizeStart`, `markServed`)
- `src/components/quiz/game.tsx`
- `supabase/migrations/0006_prefetch.sql`

---

## ADR-006: Wznowienie sesji tylko na jawne żądanie (`?sesja=<uuid>`)
Status: Accepted

### Context
Automatyczne wznawianie „jakiejkolwiek aktywnej sesji” powodowało, że wybór
nowych kategorii wracał do starej gry.

### Decision
Po starcie klient wpisuje id sesji do URL. `startSession()` wznawia tylko
z parametrem `resume`; wejście z pickera zawsze tworzy nową sesję.
Wyjątek: Quiz Dnia wznawia się automatycznie (jedno podejście na dobę).

### Reason
Intencja użytkownika: odświeżenie ≠ nowa gra, ale wybór kategorii = nowa gra.

### Consequences
Zegar serwera nie jest resetowany przy wznowieniu (brak „dokupywania” czasu).

### Evidence
- `src/app/quiz/gra/page.tsx`, `src/components/quiz/game.tsx`
- `src/lib/quiz/service.ts` (`resumeSession`)

---

## ADR-007: Limit czasu na odpowiedź egzekwowany w bazie
Status: Accepted

### Decision
20 s (nauka, Quiz Dnia) / 12 s (wyzwanie) + 3 s zapasu na sieć. Klient
odlicza i wysyła `{timeout:true}`, ale werdykt „po czasie = błędna” zapada
w `submit_answer`.

### Reason
Utrudnienie szukania odpowiedzi w internecie; klient jest niewiarygodny.

### Consequences
Limity zdublowane TS↔SQL (`ANSWER_TIME_LIMIT_MS` ↔ `0009`).

### Evidence
- `src/lib/engine/types.ts`, `supabase/migrations/0009_time_limit.sql`
- `supabase/tests/smoke.sql` blok 3d

---

## ADR-008: Rola `user` niejawna; `user_roles` tylko dla roli podwyższonej
Status: Accepted

### Decision
Brak wiersza = zwykły użytkownik. `user_roles` przechowuje wyłącznie `admin`
(i przyszłe role ze słownika `roles`). Nadawanie: service role
(`scripts/grant-role.ts`, workflow „Rola admina”). Rola sprawdzana świeżym
odczytem z bazy, nie z JWT.

### Reason
Zero triggerów i backfillu; odebranie roli działa natychmiast; nikt nie
awansuje sam siebie (brak polityk zapisu).

### Consequences
Jedno dodatkowe zapytanie na żądanie (mitygacja: React `cache()`).

### Evidence
- `supabase/migrations/0008_roles.sql`, `src/lib/db/roles.ts`, `src/lib/api.ts`

---

## ADR-009: Globalne proporcje pytań w `app_settings`
Status: Accepted

### Context
Arkusz cech ma ~97 kolumn dekorów i 26 technicznych — losowanie „po równo”
zalewało quiz pytaniami o kolory.

### Decision
Wagi kategorii (0–100) jako jedno globalne ustawienie w `app_settings`,
edytowalne w `/admin/proporcje`. Silnik dostaje je parametrem (`buildUnits`
+ `allocateSlots`, metoda największych reszt). Waga 0 = kategoria poza
losowaniem, ale jawny wybór kategorii w nauce ma pierwszeństwo.

### Reason
Właściciel produktu ma sterować trudnością/rozkładem bez deployu.

### Consequences
`DAILY_QUIZ_TEMPLATE` (sztywny szablon Quizu Dnia) został usunięty — kolidował
z wagami. Zmiany w Quizie Dnia obowiązują od następnej doby (zestaw jest
cache'owany w `daily_quiz`).

### Evidence
- `supabase/migrations/0010_settings.sql`, `0011_daily_quiz_size.sql`
- `src/lib/engine/generators.ts`, `src/lib/db/settings.ts`
- `src/app/admin/proporcje/*`

---

## ADR-010: Własne komponenty UI zamiast shadcn/ui
Status: Accepted

### Context
Podczas scaffoldingu rejestr shadcn był nieosiągalny z środowiska buildowego
(blokada sieci).

### Decision
Ręcznie napisane primitywy w `src/components/ui/` + tokeny DRE w
`src/app/globals.css`.

### Consequences
Pełna kontrola i zero zależności, ale brak gotowych wzorców (np. dialogów) —
potwierdzenia zrobiono na `window.confirm`/`prompt` (TD-008).

### Evidence
- `src/components/ui/*`, `AGENTS.md` (Konwencje)

---

## ADR-011: Migracje wykonywane ręcznie w SQL Editorze
Status: Accepted (wymuszone ograniczeniem środowiska)

### Context
Środowisko agentowe nie ma dostępu sieciowego do `*.supabase.co`
i `api.supabase.com`; właściciel produktu nie ma lokalnie Node/git.

### Decision
Migracje to zwykłe pliki `.sql` wklejane w SQL Editor przez człowieka.
Kod aplikacji musi działać także **przed** wykonaniem migracji (fallbacki na
`42P01`/`42703`, komunikat `migration_required`).

### Consequences
Repo nie wie, które migracje są wykonane na produkcji (`STATUS.md` może
podawać tylko stan „do wykonania”). Ryzyko rozjazdu schematu.

### Evidence
- `src/lib/db/settings.ts`, `src/lib/db/catalog.ts` (`fetchFeatures` fallback)
- `src/lib/quiz/service.ts` (`mapDbError` → `migration_required`)
- README sekcja 1

---

## ADR-012: Operacje na danych produkcyjnych przez GitHub Actions
Status: Accepted

### Decision
Import danych i nadawanie roli admina jako workflowy `workflow_dispatch`
z sekretami repo — jedno kliknięcie dla właściciela produktu, bez instalacji
Node.

### Evidence
- `.github/workflows/import-danych.yml`, `.github/workflows/role-admina.yml`

---

## ADR-013: Doba w strefie Europe/Warsaw
Status: Accepted

### Decision
Wszystkie „dzienne” granice (streak, Quiz Dnia, soft cap XP, misje) liczone
jako `(now() at time zone 'Europe/Warsaw')::date` w SQL i `warsawToday()` w TS.

### Reason
Użytkownicy są w Polsce; UTC przesuwałoby granicę dnia o 1–2 h.

### Evidence
- `supabase/migrations/0004_gamification.sql`, `src/lib/quiz/service.ts`

---

## ADR-014: Paginacja pełnych odczytów (`fetchAll`)
Status: Accepted (naprawa realnego buga)

### Context
PostgREST ucina wynik do 1000 wierszy. Macierz cech ma ~39 tys. wierszy —
silnik widział ~8 modeli z początku alfabetu.

### Decision
Wszystkie pełne odczyty tabel przez `fetchAll()` ze **stabilnym `ORDER BY`**
po kluczu głównym.

### Evidence
- `src/lib/db/catalog.ts`, commit `5b20f09`

---

## ADR-015: Ekran gry mieści się w wysokości okna (`h-dvh`)
Status: Accepted

### Decision
`/quiz/gra` to kolumna flex na `100dvh` z `overflow-hidden`; jedynym
elastycznym elementem jest zdjęcie (`min-h-0 flex-1` + `object-contain`).
Feedback pokazywany jako bottom-sheet.

### Reason
Dwie rundy zgłoszeń o konieczności przewijania na telefonie i tablecie.

### Consequences
Zdjęcie może być małe na niskich ekranach (zweryfikowane: 149 px na 375×667).
Ekran wyniku pozostaje przewijalny.

### Evidence
- `src/app/quiz/gra/page.tsx`, `src/components/quiz/game.tsx`, commit `bc1b5b9`

---

## ADR-016: Trasy i copy po polsku
Status: Accepted

### Decision
Ścieżki (`/logowanie`, `/quiz/gra`, `/admin/pytania`), teksty UI, komunikaty
błędów i komentarze w kodzie — po polsku. Nazwy symboli w kodzie — po
angielsku.

### Evidence
- `src/app/**` (struktura katalogów), `AGENTS.md` (Konwencje)

---

## ADR-017: Klasyfikacja cech w jednym miejscu (`featureKind`)
Status: Accepted

### Decision
Podział cech na technikę i dekory wynika z `features.category` i jest
rozstrzygany wyłącznie przez `featureKind()`; grupa „wycofane” → `null`
(poza pulą pytań). Składnia pytań technicznych: jeden wpis na kolumnę
Excela w `feature-copy.ts`, a test na prawdziwym arkuszu wymusza dopisanie
wpisu dla nowych kolumn.

### Evidence
- `src/lib/engine/types.ts`, `src/lib/engine/feature-copy.ts`
- `scripts/lib/__tests__/catalog-xlsx.test.ts`

---

## ADR-018: Brak testów UI w MVP
Status: Inferred

### Context
W repo nie ma ani jednego testu komponentu/e2e, mimo złożonego `game.tsx`;
jest za to rozbudowany harness SQL i testy silnika.

### Decision (odczytana z kodu)
Priorytet na testy reguł; UI weryfikowane ręcznie przez właściciela produktu
w kolejnych rundach feedbacku.

### Consequences
Regresje layoutu/interakcji wychodzą dopiero u użytkownika (zdarzyło się
dwukrotnie przy układzie ekranu gry). Zapisane jako TD-005.

### Evidence
- brak plików `*.test.tsx` w repo; `vitest.config.ts` (`environment: node`)
