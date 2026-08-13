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
   (0001 → 0010), albo użyj CLI: `supabase db push`.
3. **Authentication → Providers**: włącz **Email** (na start możesz wyłączyć
   „Confirm email”). Logowanie **Google** skonfigurujesz w sekcji 4 —
   większość zrobi za Ciebie skrypt.

### 2. Aplikacja lokalnie

```bash
npm install
cp .env.example .env.local   # uzupełnij klucze z Supabase
npm run dev
```

### 3. Import danych — przycisk w GitHubie (zero instalacji)

Realne dane (zdjęcia z `materialy/zdjecia/`, pytania z `materialy/teoria/`,
Excel z `materialy/cechy/`) importuje workflow **Actions → Import danych
quizu**:

1. Jednorazowo dodaj sekrety repo (**Settings → Secrets and variables →
   Actions → New repository secret**):
   - `SUPABASE_URL` — adres projektu, np. `https://TWOJ-REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — klucz service_role / Secret (`sb_secret_…`)
2. Zakładka **Actions** → po lewej „Import danych quizu” → **Run workflow**
   (możesz zaznaczyć tryb próbny, żeby najpierw zobaczyć sam raport).
3. Po 2–4 minutach dane są w bazie — odśwież aplikację.

Import jest idempotentny — kolejne uruchomienia nadpisują te same rekordy
(np. po dodaniu nowych zdjęć do `materialy/zdjecia/`).

Alternatywa lokalna (wymaga Node + `.env.local`): dane przykładowe
`npx tsx scripts/import/seed-placeholder.ts` albo poszczególne importery
z `scripts/import/` (wszystkie mają `--dry-run`).

### 4. Logowanie Google + deploy na Vercel (3 kroki)

Ręcznie klikasz tylko tam, gdzie wymagane jest Twoje konto (Google, Vercel) —
resztę robi skrypt `scripts/setup-google-auth.mjs`.

#### Krok A — Google Cloud Console (~5 min, jednorazowo)

1. [console.cloud.google.com](https://console.cloud.google.com) → wybierz swój
   projekt (np. „QuizDRE”).
2. Wyszukaj **„OAuth consent screen”** (w nowym UI: **Google Auth Platform →
   Branding**): Audience/User type **External**, App name `QuizDRE`, e-maile
   kontaktowe → zapisz. Następnie w **Audience** kliknij **Publish app**
   (ostrzeżenie o braku weryfikacji można na razie zignorować) — albo zostań
   w trybie Testing i dodaj konta graczy do **Test users**.
3. **Credentials** (nowe UI: **Google Auth Platform → Clients**) →
   **Create credentials → OAuth client ID**:
   - Application type: **Web application**, nazwa `QuizDRE Web`;
   - **Authorized redirect URIs → Add URI** — dokładnie jedna wartość:
     `https://TWOJ-REF.supabase.co/auth/v1/callback`
     (`TWOJ-REF` z adresu projektu Supabase, np. `abcdefghijklmnop`);
   - **Create** → skopiuj **Client ID** i **Client Secret**.

#### Krok B — Vercel (~4 min, jednorazowo)

1. [vercel.com/new](https://vercel.com/new) → zaloguj przez GitHub →
   **Import** repozytorium `MartinToddler/QuizDRE` (framework wykryje się sam).
2. W **Environment Variables** wklej wartości z Supabase
   (Project Settings → API): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   (+ później opcjonalnie `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
3. **Deploy** → skopiuj adres `https://….vercel.app`. Od teraz każdy push
   na branch buduje się i wdraża automatycznie.

#### Krok C — automat (cała konfiguracja Supabase + weryfikacja)

```bash
node scripts/setup-google-auth.mjs
```

Skrypt zapyta o: ref projektu (odczyta go sam z `.env.local`, jeśli jest),
token konta `sbp_…`
([dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
→ „Generate new token”; po wszystkim możesz go unieważnić), Client ID, Client
Secret i adres z Vercela. Następnie **sam włączy provider Google, ustawi Site
URL i redirecty oraz zweryfikuje na żywo**, że logowanie wystartuje
(`WERYFIKACJA: PASS`). Można go uruchamiać wielokrotnie — np. po dodaniu
własnej domeny.

#### Najczęstsze błędy logowania Google

| Objaw | Przyczyna → naprawa |
|---|---|
| Ekran Google: `redirect_uri_mismatch` | W Google Console pole „Authorized redirect URIs” musi zawierać DOKŁADNIE `https://TWOJ-REF.supabase.co/auth/v1/callback` |
| `Unsupported provider: provider is not enabled` | Provider wyłączony w Supabase → uruchom Krok C |
| „Google hasn’t verified this app” | Consent screen w trybie Testing → **Publish app** albo dodaj konto do Test users |
| `access_denied` przy logowaniu | Konto spoza listy Test users (tryb Testing) |
| Po zalogowaniu pętla / powrót na localhost | Site URL / Redirect URLs bez adresu produkcyjnego → uruchom Krok C ponownie, podając URL z Vercela |
| Powrót na logowanie z `blad=auth` (czerwony banner) | Aplikacja otwarta pod innym adresem niż zarejestrowany — Vercel ma 2 adresy (krótki produkcyjny i długi deploymentowy). Wchodź przez główny adres (Vercel → Settings → Domains) i upewnij się, że dokładnie on jest w Site URL oraz Redirect URLs |

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

## Role

Rola **user** jest niejawna (ma ją każdy zalogowany). Role podwyższone
(dziś: **admin** — panel administracyjny) trzyma tabela `user_roles`;
zapisy wyłącznie service role, więc nikt nie nada sobie roli sam.

Nadanie / odebranie admina — **Actions → „Rola admina”** (e-mail +
nadaj/odbierz; wymaga migracji `0008_roles.sql` i konta danej osoby),
albo jednorazowo w SQL Editorze:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'osoba@firma.pl'
on conflict do nothing;
```

Weryfikacja: Ustawienia → karta „Konto” pokazuje chip „Administrator”
oraz przycisk **„Panel admina”** (`/admin`) — CRUD pytań teoretycznych
i tabela użytkowników (logowania, aktywność, seria, XP, celność).
Nowa rola w przyszłości = `insert into roles (name, description) …` —
bez zmiany schematu.

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
