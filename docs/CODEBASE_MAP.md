# CODEBASE MAP

Mapa najważniejszych katalogów i plików. Nie jest to spis wszystkich plików —
wskazuje miejsca, w których faktycznie się pracuje.

## Entry points

| Plik | Rola |
|---|---|
| `src/app/layout.tsx` | root layout, metadata PWA, rejestracja manifestu |
| `src/proxy.ts` | middleware Next 16: odświeżanie sesji Supabase + redirecty |
| `src/app/page.tsx` | dashboard (pierwszy ekran po zalogowaniu) |
| `src/components/quiz/game.tsx` | cała gra po stronie klienta |
| `src/lib/quiz/service.ts` | serwerowy cykl życia sesji quizu |
| `supabase/migrations/*.sql` | schemat + reguły gry w SQL |

---

## `/src/app`
**Purpose:** trasy (App Router), server components i server actions.
**Important files:**
- `page.tsx` — dashboard: streak, ranga, Quiz Dnia, misje, CTA trybów
- `(auth)/logowanie/page.tsx`, `(auth)/rejestracja/page.tsx` — client, Supabase Auth
- `auth/callback/route.ts` — wymiana kodu OAuth na sesję, komunikaty błędów
- `onboarding/{page.tsx,onboarding-form.tsx,actions.ts}` — nick, firma (opcjonalna), godzina przypomnień
- `quiz/page.tsx` — picker kategorii nauki + wejście w wyzwanie
- `quiz/gra/page.tsx` — parsowanie parametrów (`mode`, `categories`, `sesja`, `po`) i montaż gry
- `ranking/page.tsx` — 6 zakładek rankingów (RPC do funkcji SQL)
- `profil/page.tsx` — statystyki, skuteczność wg kategorii, odznaki, historia sesji
- `ustawienia/{page.tsx,settings-form.tsx,actions.ts,logout-button.tsx,push-toggle.tsx}`
- `admin/**` — panel: `pytania` (CRUD teorii), `proporcje` (wagi + długość Quizu Dnia), `uzytkownicy` (tabela + usuwanie konta)
- `api/quiz/sessions/**/route.ts` — JSON API gry (6 endpointów)
**Dependencies:** `src/components`, `src/lib/*`
**Used by:** Next router
**Notes:** trasy po polsku; strony z danymi użytkownika mają
`export const dynamic = "force-dynamic"`. Server actions trzymają się wzorca
walidacja `zod` → guard → zapis service role → `revalidatePath`.

## `/src/components`
**Purpose:** komponenty UI.
**Important files:**
- `app-shell.tsx` — górny pasek (logo, ikona 🛡️ dla adminów, ⚙️) + dolna nawigacja mobilna; **async server component** (sam czyta rolę)
- `quiz/game.tsx` — stan gry: prefetch pytań, timer z auto-oddaniem, beacon `served`, bottom-sheet feedbacku, dogrywka wyzwania
- `quiz/answers.tsx` — render odpowiedzi; wariant binarny vs ABCD **po kształcie payloadu** (liczba opcji)
- `quiz/result.tsx` — ekran wyniku (XP, bonusy, seria, awans, odznaki, misje)
- `quiz/learning-picker.tsx` — multi-wybór kategorii (domyślnie wszystkie)
- `quiz/categories.ts` — `CATEGORY_INFO` i `QTYPE_INFO` (ikony/nazwy kategorii, współdzielone z profilem i panelem)
- `quiz/confetti.tsx`, `push-opt-in.tsx`, `setup-notice.tsx`, `logo.tsx`
- `ui/*` — `Button`, `Card`, `Chip`, `Input`/`Textarea`/`Select`/`Label`, `Progress`, `Spinner`
**Dependencies:** `src/lib/engine` (typy, `pickComment`, limity), `src/lib/cn`
**Used by:** `src/app/**`
**Notes:** brak biblioteki komponentów (bez shadcn) — patrz ADR-010.

## `/src/lib/engine`
**Purpose:** logika domenowa quizu. **Czysty TypeScript** — zero importów
z Next/React/Supabase (inwariant, przygotowanie pod Expo).
**Important files:**
- `types.ts` — `QTYPES`, `CATEGORIES`, `QuestionPayload`, `answerValueSchema`, `CatalogSnapshot`, `featureKind()`, `QuestionMix`/`DEFAULT_QUESTION_MIX`, limity czasu (`ANSWER_TIME_LIMIT_MS`), schematy wejścia API
- `generators.ts` — generatory 4 typów pytań, `buildUnits()`, `allocateSlots()`, `composeLearningSession()`, `composeChallengeBatch()`, `composeDailyQuiz()`, `GenState`
- `feature-copy.ts` — składnia pytań technicznych per kolumna Excela (26 wpisów) + `foldName()`
- `xp.ts` — stałe XP, `speedBonus`, `comboBonus`, `answerXp`, `RANKS`, `rankForXp`
- `streak.ts` — `applyActivity()`, zamrożenia serii
- `narrator.ts` — copy komentarzy (`pickComment`, `challengeOverComment`, `perfectComment`)
- `rng.ts` — `mulberry32`, `shuffle`, `pick`, `weightedPick`, `chance`
- `index.ts` — re-eksport wszystkiego (importuj `@/lib/engine`)
- `__tests__/` — testy jednostkowe + `fixtures.ts` (`makeSnapshot()`)
**Dependencies:** tylko `zod`
**Used by:** `src/lib/quiz/service.ts`, komponenty klienckie, `scripts/*`
**Notes:** losowość wyłącznie przez wstrzykiwany `Rng` — dzięki temu Quiz Dnia
jest deterministyczny (seed z daty), a testy powtarzalne.

## `/src/lib/db`
**Purpose:** dostęp do danych (wszystkie pliki `import "server-only"`).
**Important files:**
- `server.ts` — `createSupabaseServerClient()` (sesja użytkownika, RLS), `createAdminClient()` (service role), `getSessionUser()` w `cache()`
- `client.ts` — klient przeglądarkowy (tylko auth: logowanie/rejestracja/push)
- `catalog.ts` — `loadCatalogSnapshot()`, **`fetchAll()`** (paginacja PostgREST), `signImagePath()`, `signImagePaths()`
- `dashboard.ts` — `getDashboard()`, `DAILY_GOAL`, definicje 3 misji dziennych (muszą zgadzać się z `finish_session`)
- `settings.ts` — `getQuestionMix()`/`setQuestionMix()`, `getDailyQuizSize()`/`setDailyQuizSize()` na wspólnych `getSetting`/`setSetting`
- `roles.ts` — `getUserRoles()` (w `cache()`), `isAdmin()`
- `companies.ts` — `listCompanies()` z samonaprawiającym seedem („DRE”, „Inna firma”)
- `admin-users.ts` — `listUsersWithStats()` (Auth Admin API + statystyki), `countActiveSince()`, `deleteUserAccount()`
**Dependencies:** `@supabase/supabase-js`, `@supabase/ssr`, `src/lib/env.ts`
**Used by:** `src/app/**`, `src/lib/quiz/service.ts`
**Notes:** kod toleruje brak kolumn/tabel z nowszych migracji (kody błędów
`42703`, `42P01`) — dzięki temu deploy może wyprzedzić wykonanie migracji.

## `/src/lib/quiz`
**Purpose:** orkiestracja sesji quizu (jedyne miejsce wołające funkcje SQL gry).
**Important files:**
- `service.ts` — `startSession()`, `startDailySession()`, `resumeSession()`, `serveBatch()`, `markServed()`, `submitAnswer()`, `extendChallengeBatch()`, `extendChallenge()`, `finishSession()`, `warsawToday()`, `QuizError`, `mapDbError()`
- `availability.ts` — `availableCategories()` (które kategorie mają dość pytań)
**Dependencies:** `src/lib/db/*`, `src/lib/engine`
**Used by:** `src/app/api/quiz/**`, `src/app/quiz/page.tsx`
**Notes:** `serveQuestion()`/`serve()` to pozostałość po modelu „pytanie na
żądanie” — DEPRECATED (TD-001).

## `/src/lib` (pozostałe)
- `api.ts` — `withApi()`, `requireUser()`, `requireAdmin()`
- `admin-guard.ts` — `requireAdminPage()` (redirect), `assertAdmin()` (throw)
- `env.ts` — dostęp do zmiennych środowiskowych z łagodną degradacją, `STORAGE_BUCKET`, `SIGNED_URL_TTL_SECONDS`
- `cn.ts` — łączenie klas CSS
- `push/client.ts` — subskrypcje Web Push w przeglądarce

## `/supabase`
**Purpose:** schemat bazy, reguły gry, testy SQL, job push.
**Important files:**
- `migrations/0001_init.sql` — firmy, profile, trigger `handle_new_user`
- `migrations/0002_catalog.sql` — katalog (modele, cechy, macierz, teoria), RLS bez polityk
- `migrations/0003_quiz.sql` — sesje, pytania sesji, `create_session`/`submit_answer`/`append_questions`/`mark_question_served`
- `migrations/0004_gamification.sql` — statystyki, XP, odznaki, misje, `finish_session`, 4 rankingi, `rank_index`
- `migrations/0005_push.sql` — subskrypcje, log, `get_reminder_recipients`
- `migrations/0006_prefetch.sql` — `submit_answer` v2 (tolerancja braku `served_at`)
- `migrations/0007_dekory.sql` — `features.image_path`, `session_questions.swatch_path`, kategoria `dekory`
- `migrations/0008_roles.sql` — `roles`, `user_roles`, `has_role`
- `migrations/0009_time_limit.sql` — `submit_answer` v3 (limit czasu 20/12 s)
- `migrations/0010_settings.sql` — `app_settings` (+ `question_mix`)
- `migrations/0011_daily_quiz_size.sql` — klucz `daily_quiz_size`
- `migrations/0012_user_delete.sql` — FK „autorstwa” → `on delete set null`
- `tests/smoke.sql` — 11 bloków asercji (przepływ gry, RLS, role, limity, kaskada usuwania konta)
- `tests/shim_auth.sql` — emulacja `auth.users`/`auth.uid()` na lokalnym PG
- `functions/send-reminders/index.ts` — Edge Function push
- `setup/cron.sql` — harmonogram pg_cron (do wykonania raz, ręcznie)
**Used by:** `scripts/db-test.sh`, Supabase SQL Editor

## `/scripts`
**Purpose:** import danych, narzędzia, testy parsera.
**Important files:**
- `import/photos.ts` — zdjęcia + lustra, hashowane nazwy, `--orientation`, `--dry-run`
- `import/features.ts` — macierz cech z Excela (kolekcja → modele po prefiksie)
- `import/theory.ts` — pytania teoretyczne z JSON
- `import/dekory.ts` — próbki dekorów (nazwa pliku = nazwa dekoru)
- `import/seed-placeholder.ts` — dane przykładowe
- `lib/catalog-xlsx.ts` — parser arkusza DRE (`parseCatalogXlsx`, `matchModelsToRows`, `CATALOG_ALIASES`)
- `lib/db.ts`, `lib/env.ts`, `lib/door-svg.ts`
- `grant-role.ts` — nadanie/odebranie roli
- `make-icons.ts` — ikony PWA (`prebuild`)
- `setup-google-auth.mjs` — konfigurator Supabase Auth (zero zależności)
- `db-test.sh` — tymczasowy klaster PG + migracje + smoke
**Notes:** importery uruchamiane lokalnie (`npx tsx …`) albo przez
`.github/workflows/import-danych.yml`.

## `/materialy`
**Purpose:** dane źródłowe wrzucane przez właściciela produktu (nie kod).
**Important files:** `README.md` (instrukcja formatów), `zdjecia/` (330 plików),
`cechy/KATALOG specyfikacja kolekcji.xlsx`, `teoria/pytania-teoria.json`,
`branding/` (screeny dre.pl), `katalog/` (puste — czeka na PDF),
`dekory/` (nie istnieje — czeka na próbki).

## `/.github/workflows`
- `import-danych.yml` — `workflow_dispatch`: zakres (wszystko/zdjecia/teoria/cechy/dekory), `proba` (dry-run), `orientacja`
- `role-admina.yml` — `workflow_dispatch`: e-mail + nadaj/odbierz
**Notes:** **brak workflow CI** uruchamiającego testy/lint/build (TD-004).

## `/public`
`manifest.webmanifest`, `sw.js` (push, bez cache), `icons/` (generowane w `prebuild`).

---

## Where do I change X?

| Chcę… | Idź do |
|---|---|
| zmienić logikę losowania pytań / proporcje | `src/lib/engine/generators.ts` (`buildUnits`, `allocateSlots`, `compose*`) |
| dodać nowy typ pytania | `src/lib/engine/types.ts` + `generators.ts` + `src/components/quiz/answers.tsx` + migracja (`check qtype`) — patrz ARCHITECTURE „Extension points” |
| zmienić treść pytań o cechy techniczne | `src/lib/engine/feature-copy.ts` (jeden wpis na kolumnę Excela) |
| zmienić punktację / rangi / streak | `src/lib/engine/xp.ts` + `streak.ts` **oraz** migracje `0003`/`0004` (SQL jest autorytatywny) |
| zmienić limit czasu na odpowiedź | `ANSWER_TIME_LIMIT_MS` w `src/lib/engine/types.ts` **oraz** `0009_time_limit.sql` |
| zmienić teksty narratora | `src/lib/engine/narrator.ts` |
| zmienić przebieg gry w UI (timer, feedback, prefetch) | `src/components/quiz/game.tsx` |
| dodać ekran | nowy katalog w `src/app/`, `<AppShell>`, `dynamic = "force-dynamic"` |
| dodać endpoint | `src/app/api/**/route.ts` + logika w `src/lib/quiz/service.ts` |
| zmienić model użytkownika | `supabase/migrations/0001_init.sql` (profil) + nowa migracja na zmiany; UI: `src/app/onboarding`, `src/app/ustawienia` |
| zmienić logowanie / rejestrację | `src/app/(auth)/*`, `src/app/auth/callback/route.ts`, `src/proxy.ts` (redirecty) |
| dodać funkcję panelu admina | `src/app/admin/<sekcja>/` + `requireAdminPage()`/`assertAdmin()` + zakładka w `src/app/admin/tabs.tsx` |
| zmienić globalne ustawienie (proporcje, długość Quizu Dnia) | `src/lib/db/settings.ts` + `src/app/admin/proporcje/*` (+ migracja z nowym kluczem) |
| zmienić import danych / format wejściowy | `scripts/import/*`, parser: `scripts/lib/catalog-xlsx.ts`, instrukcja: `materialy/README.md` |
| zmienić wygląd / paletę / animacje | `src/app/globals.css` (tokeny `--color-dre-*`, `--animate-*`), `src/components/ui/*` |
| dodać tabelę lub zmienić RLS | nowa migracja `supabase/migrations/00NN_*.sql` + blok w `supabase/tests/smoke.sql` |
| zmienić powiadomienia push | `supabase/functions/send-reminders/index.ts`, `public/sw.js`, `src/lib/push/client.ts` |
