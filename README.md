# QuizDRE 🚪

Aplikacja szkoleniowa z wiedzy o produktach DRE w formie quizu z grywalizacją:
streaki, rangi, odznaki, rankingi (w tym ranking firm), Quiz Dnia, misje
dzienne i powiadomienia push. PWA — działa na telefonie jak natywna apka.

## Typy pytań

1. **Cecha w modelu (TAK/NIE)** — z macierzy Excela modele × cechy
2. **Prawe czy lewe skrzydło?** — zdjęcie losowo w oryginale albo odbiciu
   lustrzanym (odbicia pre-generowane serwerowo, nie do podejrzenia w DevTools)
3. **Jaki to model? (ABCD)** — zdjęcie + dystraktory z tej samej kolekcji
4. **Teoria (ABCD)** — pula pytań z `materialy/teoria/`

## Tryby

- **Nauka** — 20 pytań z kategorii (Modele / Rozwiązania techniczne /
  Prawe-lewe / Teoria / Mix), feedback i wyjaśnienie po każdym pytaniu
- **Wyzwanie** — survival: 1 błąd kończy grę, wynik idzie do tablicy rekordów
- **Quiz Dnia** — 10 identycznych pytań dla wszystkich, jedna próba dziennie

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4 · Supabase (Postgres,
Auth, Storage, Edge Functions, pg_cron) · Vercel · Web Push (VAPID).
Silnik quizu to czysty TS w `src/lib/engine` (seedowany PRNG, testy vitest) —
gotowy do współdzielenia z przyszłą aplikacją natywną (Expo/React Native).
Odpowiedzi, punktacja i czas liczone są wyłącznie server-side (funkcje SQL
`submit_answer`/`finish_session`, RLS „zamknięte domyślnie”).

---

## Uruchomienie od zera

### 1. Projekt Supabase

1. Załóż projekt na [supabase.com](https://supabase.com) (region EU).
2. W **SQL Editor** wykonaj po kolei pliki z `supabase/migrations/`
   (0001 → 0005), albo użyj CLI: `supabase db push`.
3. **Authentication → Providers**: włącz **Email** (na start możesz wyłączyć
   „Confirm email”) oraz **Google** — wg
   [instrukcji Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google)
   (Google Cloud Console → OAuth Client ID, redirect:
   `https://TWOJ-REF.supabase.co/auth/v1/callback`).
4. **Authentication → URL Configuration**: ustaw Site URL na adres produkcyjny
   (np. `https://quizdre.vercel.app`) i dodaj `http://localhost:3000` do
   Redirect URLs.

### 2. Aplikacja lokalnie

```bash
npm install
cp .env.example .env.local   # uzupełnij klucze z Supabase
npm run dev
```

### 3. Dane przykładowe (żeby od razu grać)

```bash
npx tsx scripts/import/seed-placeholder.ts
```

Tworzy 12 modeli z generowanymi zdjęciami (oryginał + lustro), macierz cech
i importuje pytania teoretyczne z `materialy/teoria/`.

### 4. Deploy na Vercel

1. Podepnij repo w [vercel.com](https://vercel.com), framework: Next.js.
2. Ustaw zmienne środowiskowe jak w `.env.example`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
3. Po deploy'u zaktualizuj Site URL w Supabase na domenę produkcyjną.

### 5. Powiadomienia push (opcjonalnie, po deploy'u)

```bash
npx web-push generate-vapid-keys   # public → env Vercela, oba → sekrety niżej
supabase functions deploy send-reminders
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:kontakt@dre.pl CRON_SECRET=silny-losowy-string
```

Następnie w SQL Editorze uruchom `supabase/setup/cron.sql` (podmień
`<PROJECT-REF>` i `<CRON_SECRET>`). Cron co godzinę wysyła: poranne
przypomnienie o godzinie wybranej przez użytkownika oraz „ratuj streaka”
ok. 19:00, gdy seria jest zagrożona.

---

## Import prawdziwych danych DRE

Pliki wrzucaj do `materialy/` (instrukcja: `materialy/README.md`), potem:

```bash
# zdjęcia drzwi (nazwa pliku = nazwa modelu; generuje odbicia lustrzane)
npx tsx scripts/import/photos.ts --dry-run     # najpierw podgląd
npx tsx scripts/import/photos.ts

# macierz cech z Excela (raportuje braki i niejednoznaczności)
npx tsx scripts/import/features.ts --dry-run
npx tsx scripts/import/features.ts

# pytania teoretyczne (JSON)
npx tsx scripts/import/theory.ts
```

Po imporcie zdjęć przejrzyj checklistę z raportu: modele o symetrycznych
zdjęciach (bez widocznej klamki) wyklucz z pytań prawe/lewe:
`update door_models set eligible_left_right = false where name in (...);`

## Testy

```bash
npm test              # silnik quizu (vitest): balans 50/50, dystraktory, streaki
npm run typecheck
./scripts/db-test.sh  # migracje + funkcje SQL na lokalnym PostgreSQL
npm run build
```

## Struktura

```
materialy/            ← tu wrzucasz Excel, zdjęcia, katalog, pytania
scripts/import/       ← importery danych + seed placeholder
src/lib/engine/       ← silnik quizu (czysty TS, przenośny do Expo)
src/lib/quiz/         ← serwis sesji (server-only)
src/app/api/quiz/     ← kontrakt HTTP (używany też przez przyszłe appki natywne)
supabase/migrations/  ← schemat, RLS, funkcje gry (submit_answer, finish_session)
supabase/functions/   ← Edge Function przypomnień push
supabase/tests/       ← smoke test SQL (scripts/db-test.sh)
```

## Grywalizacja — mechanika

- **XP:** +10 za poprawną (+15 w Quizie Dnia), bonus za tempo (do +5),
  bonus combo (do +10), bonusy sesyjne, dzienny soft-cap 500 XP (anty-grind)
- **Rangi:** 10 progów od Świeżaka do Legendy DRE (`src/lib/engine/xp.ts`)
- **Streak:** dzień aktywny = sesja z ≥5 odpowiedziami; zamrożenia chronią
  serię (1 za każde 7 dni, max 2); wszystko liczone w strefie Europe/Warsaw
- **Odznaki:** ~20 na start, kryteria deklaratywne w tabeli `badges`
- **Rankingi:** dzienny / miesięczny / all-time / wyzwanie / Quiz Dnia +
  ranking firm (średnia XP na aktywnego gracza, min. 3 osoby)
- **Misje dzienne:** cel 20 pytań, combo x8, Quiz Dnia — auto-nagradzane

## Roadmapa (post-MVP)

Mikrolekcje „Podstawy” (dawka wiedzy + minitest), powtórka błędów (spaced
repetition), tryb 60 sekund, ligi tygodniowe, sezony, pojedynki 1v1, panel
admina, statystyki dla trenerów (które modele mylą się najczęściej),
aplikacje natywne Expo na tym samym backendzie.
