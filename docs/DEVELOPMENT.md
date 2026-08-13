# DEVELOPMENT — uruchomienie od zera

Zakładamy czystą maszynę. Wszystkie komendy uruchamiane z katalogu głównego
repozytorium.

## Requirements

| Narzędzie | Wersja | Wymagane? | Uwagi |
|---|---|---|---|
| Node.js | 20+ (CI używa 22) | tak | `.github/workflows/*` ustawiają `node-version: 22` |
| npm | wraz z Node | tak | lockfile: `package-lock.json` (nie yarn/pnpm) |
| Projekt Supabase | — | tak, do uruchomienia aplikacji | darmowy plan wystarcza; region EU |
| PostgreSQL 14+ (`initdb`, `pg_ctl`, `psql` w PATH) | — | tylko do `./scripts/db-test.sh` | harness tworzy tymczasowy klaster, **nie potrzebuje Dockera** |
| Supabase CLI | — | nie | alternatywa dla wklejania migracji (`supabase db push`) |

## Installation

```bash
npm install
cp .env.example .env.local   # potem uzupełnij wartości (niżej)
```

## Environment variables

Odczyt: `src/lib/env.ts` (z łagodną degradacją — bez konfiguracji aplikacja
renderuje `SetupNotice` zamiast się wysypywać). Skrypty importu czytają
`.env.local` przez `scripts/lib/env.ts`.

```text
NEXT_PUBLIC_SUPABASE_URL
Purpose: adres projektu Supabase (używany w przeglądarce i na serwerze)
Required: yes
Safe example: https://twoj-ref.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY
Purpose: klucz publiczny (anon / „publishable”) — klient przeglądarki, RLS
Required: yes
Safe example: sb_publishable_xxxxxxxxxxxxxxxxxxxx
Fallback: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (nowy format kluczy Supabase)

SUPABASE_SERVICE_ROLE_KEY
Purpose: klucz serwisowy — omija RLS; TYLKO serwer i skrypty importu
Required: yes (bez niego gra nie działa: generacja pytań i punktacja)
Safe example: sb_secret_xxxxxxxxxxxxxxxxxxxx
Fallback: SUPABASE_SECRET_KEY
NIGDY nie dodawaj prefiksu NEXT_PUBLIC_ do tego klucza.

NEXT_PUBLIC_VAPID_PUBLIC_KEY
Purpose: klucz publiczny Web Push (subskrypcja w przeglądarce)
Required: no (bez niego przełącznik push zwraca „unsupported”)
Safe example: BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U

PHOTO_HASH_SALT
Purpose: sól do hashowania nazw plików zdjęć (zmiana = nowe nazwy w Storage)
Required: no (domyślnie „quizdre-v1” w skrypcie importu)
Safe example: quizdre-v1
```

Sekrety Edge Function (ustawiane przez `supabase secrets set`, **nie** w
`.env.local`): `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`,
`CRON_SECRET`.

Sekrety repozytorium GitHub (Settings → Secrets → Actions), potrzebne dla
workflowów importu i nadawania roli: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`.

## Database setup

1. Utwórz projekt w Supabase (region EU).
2. **SQL Editor** → wykonaj po kolei pliki `supabase/migrations/0001…0012`
   (albo `supabase db push`, jeśli masz CLI).
   Kolejność jest istotna — `submit_answer` jest nadpisywana w `0006` i `0009`.
3. **Authentication → Providers** → włącz Email; na czas testów możesz
   wyłączyć „Confirm email”.
4. Logowanie Google i deploy: README, sekcja „4. Logowanie Google + deploy
   na Vercel”. Pomocniczy konfigurator: `node scripts/setup-google-auth.mjs`
   (zero zależności; wymaga tokenu dostępu do Supabase Management API).

Sprawdzenie schematu bez Supabase (lokalnie, offline):

```bash
./scripts/db-test.sh
```

Skrypt: tworzy tymczasowy klaster PG → wykonuje `supabase/tests/shim_auth.sql`
(emulacja `auth.users`/`auth.uid()`) → wszystkie migracje → nadaje granty jak
w Supabase → uruchamia `supabase/tests/smoke.sql` → sprząta po sobie.

## Seed / dane do gry

```bash
# minimalny zestaw do klikania lokalnie (modele, cechy, teoria)
npx tsx scripts/import/seed-placeholder.ts

# dane produkcyjne z materialy/ (każdy skrypt ma --dry-run)
npx tsx scripts/import/photos.ts --dry-run
npx tsx scripts/import/photos.ts --orientation right
npx tsx scripts/import/features.ts
npx tsx scripts/import/theory.ts
npx tsx scripts/import/dekory.ts
```

Alternatywa bez lokalnego Node: GitHub → **Actions → „Import danych quizu”**
(wymaga sekretów repo).

## Development server

```bash
npm run dev     # http://localhost:3000
```

Bez skonfigurowanego Supabase zobaczysz ekran `SetupNotice`
(`src/components/setup-notice.tsx`), a nie błąd.

## Build

```bash
npm run build   # prebuild: scripts/make-icons.ts generuje ikony PWA (sharp)
npm start
```

Deploy: Vercel podłączony do repozytorium — push na gałąź uruchamia build.
W Vercelu muszą być ustawione te same zmienne środowiskowe; zmiana
`NEXT_PUBLIC_*` **wymaga ponownego deployu** (są wstrzykiwane w czasie builda).

## Common development commands

```bash
npm test                    # vitest (silnik + parser Excela)
npx vitest run src/lib/engine   # tylko silnik
npm run typecheck
npm run lint
./scripts/db-test.sh
npx tsx scripts/grant-role.ts --email osoba@firma.pl --role admin
npx tsx scripts/grant-role.ts --email osoba@firma.pl --role admin --revoke
```

## Troubleshooting

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| Ekran „Brakuje konfiguracji” | brak `NEXT_PUBLIC_SUPABASE_URL`/klucza anon lub service role → uzupełnij `.env.local`, zrestartuj dev server |
| „Baza pytań jest pusta” w `/quiz` | brak danych katalogowych → `seed-placeholder.ts` lub import z `materialy/` |
| Błąd `migration_required` w grze | brak wykonanej migracji (np. `0007`) → wklej brakujące pliki w SQL Editor |
| „Invalid API key” po logowaniu | zły/skrócony klucz w środowisku; przy nowym formacie kluczy: `sb_publishable_…` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `sb_secret_…` → `SUPABASE_SERVICE_ROLE_KEY`; po zmianie **Redeploy** |
| `redirect_uri_mismatch` przy Google | w Google Console musi być dokładnie `https://<ref>.supabase.co/auth/v1/callback` |
| Logowanie wraca na `/logowanie` | sprawdź Site URL i Redirect URLs w Supabase (adres Vercela + `/**`); szczegóły w banerze `?blad=auth&opis=…` |
| Pytania tylko o modele z początku alfabetu | regresja paginacji — pełne odczyty muszą iść przez `fetchAll()` (limit 1000 wierszy PostgREST) |
| `./scripts/db-test.sh`: „initdb cannot be run as root” | skrypt sam przełącza się na użytkownika `postgres`; upewnij się, że taki użytkownik istnieje |
| `npm run build` pada na ikonach | brak `sharp` (reinstall `npm install`) |
| Brak dostępu do `*.supabase.co` z sesji agenta | środowisko agentowe blokuje ruch do Supabase — użyj GitHub Actions albo poproś człowieka o wykonanie w dashboardzie |
