# CLAUDE.md — punkt wejścia dla agentów AI

> Czytasz ten plik jako PIERWSZY. Jest źródłem prawdy o zasadach pracy
> w tym repozytorium. Szczegóły są w `docs/` (mapa: `docs/README.md`).

## Project identity

- **Nazwa:** QuizDRE
- **Opis w jednym zdaniu:** Aplikacja webowa (PWA) do szkolenia handlowców
  ze znajomości katalogu drzwi DRE — quiz z grywalizacją, po polsku.
- **Główny cel:** żeby doradca odruchowo wiedział, jaki to model, jakie ma
  cechy techniczne, w jakich dekorach występuje i czy skrzydło jest prawe
  czy lewe.
- **Etap rozwoju:** MVP wdrożone i używane produkcyjnie (Vercel + Supabase),
  trwa runda iteracji na feedbacku właściciela produktu. Szczegółowy stan:
  `docs/STATUS.md`.

## Mandatory reading

Kolejność dla nowego agenta:

1. `CLAUDE.md` (ten plik)
2. `docs/PRODUCT.md` — co to za produkt i słownik pojęć domenowych
3. `docs/ARCHITECTURE.md` — warstwy, granice, extension points
4. `docs/CODEBASE_MAP.md` — gdzie co leży („Where do I change X?”)
5. `docs/STATUS.md` — co działa, co w toku, co blokuje
6. Dokument właściwy dla zadania: `docs/DATA_MODEL.md`, `docs/USER_FLOWS.md`,
   `docs/DEVELOPMENT.md`, `docs/TESTING.md`, `docs/DECISIONS.md`,
   `docs/TECH_DEBT.md`, `docs/ROADMAP.md`
7. `AGENTS.md` — zwięzła lista zasad krytycznych (skrót tego, co niżej)

## Tech stack

Next.js 16.3 (App Router) · React 19.2 · TypeScript 5 · Tailwind CSS v4 ·
Supabase (Postgres + Auth + Storage + Edge Functions) · zod 4 · vitest 4 ·
npm · deploy: Vercel. Pełna lista zależności: `package.json`.

## Commands

Zweryfikowane (istnieją w `package.json` / repo):

| Komenda | Do czego |
|---|---|
| `npm install` | instalacja zależności |
| `npm run dev` | dev server (http://localhost:3000) |
| `npm run build` | build produkcyjny (`prebuild` generuje ikony PWA przez `sharp`) |
| `npm start` | serwer produkcyjny po buildzie |
| `npm test` | vitest (silnik quizu + parser Excela) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint (flat config) |
| `./scripts/db-test.sh` | migracje + funkcje SQL + RLS na tymczasowym klastrze PostgreSQL |
| `npx tsx scripts/import/<nazwa>.ts --dry-run` | import danych (zdjęcia / cechy / teoria / dekory), podgląd bez zapisu |
| `npx tsx scripts/import/seed-placeholder.ts` | dane przykładowe do lokalnej gry |
| `npx tsx scripts/grant-role.ts --email <adres> --role admin` | nadanie roli admina |

**Migracje bazy nie mają automatu** — pliki `supabase/migrations/*.sql`
wykonuje człowiek w Supabase SQL Editor (albo `supabase db push`, jeśli ma
CLI). Szczegóły: `docs/DEVELOPMENT.md`.

## Architecture rules

- **Logika domenowa** (generowanie pytań, XP, streak, narrator) żyje
  w `src/lib/engine/` i jest **czystym TypeScriptem**: zero importów
  z Next/React/Supabase, losowość tylko przez wstrzykiwany `Rng`.
  Ten katalog ma być przenośny do przyszłej aplikacji Expo.
- **Dostęp do danych** wyłącznie przez `src/lib/db/*` i `src/lib/quiz/service.ts`
  (oba `import "server-only"`). Komponenty i strony nie tworzą klientów
  Supabase do zapisu danych gry.
- **Reguły gry rozstrzyga SQL** — `submit_answer`, `finish_session`
  w `supabase/migrations/`. Serwer Next tylko woła RPC i mapuje wynik.
- **UI**: strony i server actions w `src/app/`, komponenty w `src/components/`,
  własne primitywy w `src/components/ui/` (świadomie bez shadcn — patrz
  ADR-010 w `docs/DECISIONS.md`).
- Nowy endpoint API → `src/app/api/**/route.ts`, zawsze przez `withApi()`
  + `requireUser()`/`requireAdmin()` z `src/lib/api.ts`.
- Każda strona panelu admina → `requireAdminPage()`, każda server action
  panelu → `assertAdmin()` (`src/lib/admin-guard.ts`).
- Trasy użytkownika są **po polsku** (`/logowanie`, `/quiz`, `/ranking`,
  `/profil`, `/ustawienia`, `/admin/pytania`).

## Agent operating rules

### BEFORE MAKING CHANGES

1. Przeczytaj `CLAUDE.md`.
2. Przeczytaj `docs/STATUS.md` (co jest w toku, co zablokowane).
3. Przeczytaj właściwą sekcję `docs/ARCHITECTURE.md`.
4. Znajdź istniejącą implementację podobnej funkcji (`docs/CODEBASE_MAP.md`
   → „Where do I change X?”) i trzymaj się jej wzorca.
5. Sprawdź testy pokrywające modyfikowany obszar (`docs/TESTING.md`).
6. Upewnij się, że zmiana nie łamie decyzji z `docs/DECISIONS.md`
   ani inwariantów niżej.

### AFTER MAKING CHANGES

1. Uruchom testy właściwe dla zmiany (minimum `npm test`; zmiany w SQL →
   `./scripts/db-test.sh`).
2. Uruchom `npm run lint`, `npm run typecheck`, `npm run build`, jeśli
   dotyczą zmiany. **Nie ufaj potokom** typu `npm run lint | tail` —
   maskują kod wyjścia (patrz Known traps).
3. Zaktualizuj dokumentację, jeśli zmieniła się architektura, model danych
   lub funkcjonalność.
4. Zaktualizuj `docs/STATUS.md`.
5. Dopisz wpis do `docs/CHANGELOG_AI.md`.
6. **Nie oznaczaj funkcji jako ukończonej, jeśli testy nie przechodzą.**
7. Jeśli zmiana wymaga nowej migracji SQL — powiedz to użytkownikowi wprost
   (musi ją wkleić ręcznie) i zadbaj, by kod działał także PRZED migracją
   (wzorzec: fallback na kod błędu `42P01`/`42703`, patrz
   `src/lib/db/settings.ts`, `src/lib/db/catalog.ts`).

## Critical invariants

Rzeczy, których nie wolno złamać:

1. **Klient nigdy nie widzi poprawnej odpowiedzi przed udzieleniem własnej.**
   `door_models`, `features`, `model_features`, `theory_questions`,
   `session_questions`, `daily_quiz`, `app_settings` mają RLS **bez polityk**
   (dostęp tylko service role). Payload pytania wysyłany do przeglądarki
   nie zawiera `correctAnswer` — porównanie robi SQL.
2. **Formuły XP / rang / streaka / limitu czasu istnieją w DWÓCH miejscach**
   i muszą się zgadzać: `src/lib/engine/{xp,streak,types}.ts` (wyświetlanie,
   testy) oraz migracje `0003`/`0004`/`0009` (autorytatywne). Zmieniasz
   jedno — zmień drugie i uruchom `./scripts/db-test.sh`.
3. **`src/lib/engine` pozostaje czystym TS** (bez Next/React/Supabase).
4. **Daty dzienne zawsze w Europe/Warsaw**: w SQL
   `(now() at time zone 'Europe/Warsaw')::date`, w TS `warsawToday()`
   z `src/lib/quiz/service.ts`.
5. **Zdjęcia drzwi są prywatne** (bucket `door-photos`, nazwy = hashe, tak
   by oryginał i lustro były nieodróżnialne) i serwowane wyłącznie przez
   krótkie signed URL-e (`signImagePaths`, TTL 600 s).
6. **Zapisy do `user_roles`, `app_settings`, tabel katalogu — tylko service
   role.** Nikt nie może nadać sobie roli ani zmienić proporcji z klienta.
7. **Lista misji w `finish_session` (SQL) musi odpowiadać liście
   w `src/lib/db/dashboard.ts`** — inaczej dashboard pokazuje misje,
   których baza nie przyznaje (albo odwrotnie).
8. **Klasyfikacja cech w jednym miejscu**: `featureKind()`
   w `src/lib/engine/types.ts` (grupa „wycofane” → poza pulą pytań).

## Known traps

- **`src/proxy.ts`, nie `middleware.ts`** — Next 16 zmienił nazwę pliku
  middleware. Tam żyje odświeżanie sesji Supabase i redirecty.
- **Limit 1000 wierszy PostgREST.** Każdy pełny odczyt tabeli musi iść przez
  `fetchAll()` z `src/lib/db/catalog.ts` **ze stabilnym `ORDER BY`**.
  Historyczny bug: macierz cech (~39 tys. wierszy) była ucięta do ~8 modeli
  z początku alfabetu (commit `5b20f09`).
- **`submit_answer` istnieje w trzech wersjach** (`0003`, `0006`, `0009`)
  jako `create or replace`. Obowiązuje NAJNOWSZA wykonana migracja —
  kolejność wykonywania ma znaczenie.
- **Kod wyjścia w potokach.** `npm run lint | tail` zwraca 0 nawet przy
  błędach; loguj do pliku i sprawdzaj `$?` (raz przepuściło to błąd na produkcję).
- **`prebuild` wymaga `sharp`** — `npm run build` generuje ikony PWA
  (`scripts/make-icons.ts`).
- **Reguły lintera `react-hooks` w tym repo są surowe**: `set-state-in-effect`
  i `purity` (`Date.now()` w ciele komponentu) potrafią zablokować build —
  wzorce obejścia: `src/components/quiz/game.tsx` (reset timera podczas
  renderu), `src/lib/db/admin-users.ts` (`countActiveSince`).
- **Środowisko agentowe blokuje sieć do `*.supabase.co` i `api.supabase.com`**
  — nie da się z niego czytać/zapisywać produkcyjnej bazy. Operacje na
  danych idą przez GitHub Actions (`.github/workflows/import-danych.yml`,
  `role-admina.yml`) albo wykonuje je człowiek w dashboardzie.
- **Nowa kolumna w Excelu cech** obleje `scripts/lib/__tests__/catalog-xlsx.test.ts`,
  dopóki nie dopiszesz wpisu do `src/lib/engine/feature-copy.ts`. To celowe.
- **Martwy kod**: `GET /api/quiz/sessions/[id]/questions/[seq]` i
  `serveQuestion()` w `src/lib/quiz/service.ts` nie są używane po przejściu
  na prefetch (patrz `docs/TECH_DEBT.md`, TD-001) — nie buduj na nich.
