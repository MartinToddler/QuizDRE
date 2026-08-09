# QuizDRE — notatki dla agentów i deweloperów

Aplikacja quizowa do szkolenia z produktów DRE (drzwi). Język UI: polski.

## Komendy

- `npm run dev` / `npm run build` (prebuild generuje ikony PWA)
- `npm test` — vitest, silnik quizu
- `npm run typecheck`
- `./scripts/db-test.sh` — migracje + funkcje SQL na lokalnym PostgreSQL
  (tymczasowy klaster, wymaga zainstalowanego postgresa; działa bez Dockera)

## Zasady krytyczne

1. **Klient NIGDY nie widzi poprawnej odpowiedzi przed udzieleniem własnej.**
   `door_models`, `theory_questions`, `session_questions`, `daily_quiz` mają
   RLS bez polityk (dostęp tylko service role). Wyniki liczy SQL
   (`submit_answer`, `finish_session`) — transakcyjnie.
2. **Formuły XP/rang/streaka istnieją w DWÓCH miejscach** i muszą być zgodne:
   `src/lib/engine/xp.ts` + `src/lib/engine/streak.ts` (wyświetlanie, testy)
   oraz `supabase/migrations/0003/0004` (autorytatywne). Zmieniasz jedno —
   zmień drugie i przetestuj `./scripts/db-test.sh`.
3. **`src/lib/engine` to czysty TS** — zero importów z Next/Supabase/React.
   Ma być przenośny do aplikacji Expo. Losowość tylko przez wstrzykiwany
   `Rng` (seedowany w testach i Quizie Dnia).
4. **Daty dzienne zawsze w Europe/Warsaw** — w SQL:
   `(now() at time zone 'Europe/Warsaw')::date`, w TS: `warsawToday()`.
5. Zdjęcia drzwi żyją w prywatnym buckecie `door-photos`, nazwy plików to
   hashe (oryginał i lustro nieodróżnialne), serwowane przez signed URLs.
   Próbki dekorów tamże pod `dekory/` (slugi — nazwa dekoru nie jest tajna,
   pada w treści pytania). Misje w `finish_session` muszą odpowiadać liście
   w `src/lib/db/dashboard.ts`.
6. Cechy z Excela dzielą się wg `features.category` na technikę
   („dodatkowe informacje”) i dekory — klasyfikacja w JEDNYM miejscu:
   `featureKind()` w `src/lib/engine/types.ts` (grupa „wycofane” → poza
   pulą pytań). Kategorie nauki `technical`/`dekory` współdzielą qtype
   `feature_yn`; w mix/wyzwaniu rodzaj losowany 50/50. Składnia pytań
   technicznych: per kolumna w `src/lib/engine/feature-copy.ts` — nowa
   kolumna w Excelu obleje test `catalog-xlsx.test.ts`, dopisz wpis.
7. Role (0008): „user” jest NIEJAWNA, `user_roles` trzyma tylko role
   podwyższone (`admin`); zapisy wyłącznie service role (RLS bez polityk
   zapisu), nadawanie: workflow „Rola admina” / `scripts/grant-role.ts`.
   Serwer sprawdza przez `requireAdmin()` (`src/lib/api.ts`) — świeży
   odczyt z bazy, nie JWT; `has_role()` w SQL pod RLS przyszłych tabel
   panelu admina.

## Wgrywanie danych

Materiały źródłowe → `materialy/` (patrz `materialy/README.md`), importery →
`scripts/import/*.ts` (wszystkie mają `--dry-run`). Dane przykładowe:
`npx tsx scripts/import/seed-placeholder.ts`.

## Konwencje

- Komponenty UI: własne, w `src/components/ui` (bez shadcn — rejestr
  niedostępny w środowisku buildowym). Paleta DRE w `src/app/globals.css`
  (`--color-dre-*`): pomarańcz `#fd7e14`, bursztyn `#f3ab4e`, antracyt
  `#373737` — zdjęte pikselowo ze screenów dre.pl w `materialy/branding/`.
  Przyciski: pill (rounded-full), jak CTA na stronie DRE.
- Copy narratora: `src/lib/engine/narrator.ts` — pisane neutralnie płciowo
  (bez form czasu przeszłego 2. osoby), mało emoji.
- Trasy po polsku: `/logowanie`, `/rejestracja`, `/quiz`, `/ranking`,
  `/profil`, `/ustawienia`.
