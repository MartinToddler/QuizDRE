# STATUS — aktualny stan projektu

## Last updated

**2026-08-13** — audyt repozytorium i utworzenie dokumentacji dla agentów
(`CLAUDE.md` + `docs/**`). Kod aplikacji nie był zmieniany. Stan kodu:
commit `3edf8a9` na gałęzi `claude/dre-training-quiz-app-3ow2qo`.

## Current milestone

**MVP wdrożone; runda iteracji na feedbacku właściciela produktu.**
Aplikacja działa produkcyjnie (Vercel + Supabase), dane katalogowe są
zaimportowane, użytkownik testuje i zgłasza poprawki partiami.

## Completed

Wszystko poniżej potwierdzone lekturą kodu i przechodzącymi testami:

- **Fundament**: Next 16 App Router, Tailwind v4 z paletą DRE, PWA (manifest,
  ikony generowane w `prebuild`), `SetupNotice` przy braku konfiguracji.
- **Auth**: e-mail + hasło, Google OAuth (PKCE, `/auth/callback` z czytelnymi
  błędami), sesja w cookies, redirecty w `src/proxy.ts`, onboarding
  (nick, opcjonalna firma, godzina przypomnień).
- **Baza**: 12 migracji, 19 tabel, RLS deny-by-default, ~18 funkcji SQL,
  harness `./scripts/db-test.sh` (11 bloków asercji).
- **Silnik quizu**: 4 typy pytań (w tym `feature_yn` w wariantach TAK/NIE
  i ABCD), dedupe, balans TAK/NIE i liter A–D, dystraktory spoza kolekcji,
  globalne proporcje kategorii, deterministyczny Quiz Dnia.
- **Tryby**: nauka (multi-wybór kategorii, 20 pytań), wyzwanie (survival
  + dogrywka partii w tle), Quiz Dnia (wspólny zestaw, jedno podejście).
- **Grywalizacja**: XP (szybkość, combo, soft cap), 10 rang, seria dni
  z zamrożeniami, 20 odznak, 3 misje dzienne, 6 rankingów.
- **UX gry**: prefetch pytań i obrazków, bottom-sheet feedbacku, limit czasu
  20/12 s z egzekucją w SQL, ekran gry bez przewijania (`h-dvh`), wznowienie
  po odświeżeniu (`?sesja=`).
- **Panel admina**: CRUD pytań teorii, globalne proporcje + długość Quizu
  Dnia, tabela użytkowników ze wskaźnikami, trwałe usuwanie konta z całym
  postępem; wejście ikoną 🛡️ w pasku i z Ustawień.
- **Role**: `admin` (rola `user` niejawna), nadawanie przez workflow
  „Rola admina” / `scripts/grant-role.ts`, trzy warstwy bramek.
- **Import danych**: zdjęcia + lustra, macierz cech z Excela (parser realnego
  arkusza + aliasy kolekcji), teoria z JSON, próbki dekorów; workflow
  „Import danych quizu” z `dry-run`.
- **Statystyki dla użytkownika**: skuteczność wg kategorii, odznaki, historia
  ostatnich sesji.

## In progress / partially done

| Element | Status | Gdzie w kodzie | Czego brakuje |
|---|---|---|---|
| Powiadomienia push | PARTIALLY | `public/sw.js`, `src/lib/push/client.ts`, `supabase/functions/send-reminders/`, `supabase/setup/cron.sql`, migracja `0005` | wdrożenie: `supabase functions deploy send-reminders`, sekrety VAPID + `CRON_SECRET`, uruchomienie `cron.sql` (README sekcja 5) |
| Pytania teoretyczne | PARTIALLY | `materialy/teoria/pytania-teoria.json` (31 szkiców), CRUD w `/admin/pytania` | weryfikacja merytoryczna treści; katalog PDF do `materialy/katalog/` jako źródło |
| Próbki dekorów | PARTIALLY | `features.image_path`, `scripts/import/dekory.ts`, render w `game.tsx` | pliki graficzne w `materialy/dekory/` (katalog nie istnieje) + uruchomienie importu |
| Pokrycie modeli cechami | PARTIALLY | `model_features` | kolekcje **GALLA** i **REZZO** czekają na nowszą wersję Excela (decyzja właściciela: „na razie olej”) |
| Ranking firm | IMPLEMENTED, ale pusty | `get_company_leaderboard()` | min. 3 aktywne osoby w firmie — kwestia liczby użytkowników, nie kodu |

## Next (najbardziej logiczne kolejne zadania)

1. **Weryfikacja kierunku prawe/lewe na produkcji** — jeśli oryginały to
   skrzydła lewe, wystarczy ponowny import z `orientacja: left`
   (workflow „Import danych quizu”). Blokuje sensowność całej kategorii.
2. **Treść pytań teoretycznych** — po dostarczeniu katalogu PDF wygenerować
   właściwą pulę i podmienić szkice.
3. **CI w GitHub Actions** (`npm test` + `lint` + `typecheck` + `build`
   na push/PR) — dziś nic nie chroni gałęzi przed regresją (TD-004).
4. **Testy najbardziej ryzykownego pliku** — `src/components/quiz/game.tsx`
   (TD-005).
5. **Wdrożenie push** (jeśli właściciel chce przypomnień) — zadanie
   konfiguracyjne, nie programistyczne.

## Blocked

| Co | Dlaczego | Kto odblokowuje |
|---|---|---|
| Jakakolwiek operacja na produkcyjnej bazie z sesji agenta | środowisko blokuje ruch do `*.supabase.co` i `api.supabase.com` | człowiek (SQL Editor / dashboard) lub GitHub Actions |
| Migracje `0009`–`0012` | wymagają wklejenia w SQL Editorze; **repo nie wie, czy zostały wykonane** | właściciel produktu |
| Pytania teoretyczne z katalogu | brak PDF w `materialy/katalog/` | właściciel produktu |
| Próbki dekorów | brak plików w `materialy/dekory/` | właściciel produktu |

## Known bugs / ryzyka

- **Brak potwierdzenia stanu migracji na produkcji** (`UNKNOWN`). Jeśli
  `0009`–`0012` nie zostały wykonane: limit czasu nie jest egzekwowany w SQL,
  panel proporcji nie zapisze zmian, ustawienie długości Quizu Dnia nie
  zadziała, a usunięcie konta może paść na kluczu obcym. Kod jest na to
  odporny (fallbacki + komunikaty), ale funkcje pozostają nieaktywne.
- **Zdublowane formuły TS↔SQL** — rozjazd nie zostanie wykryty automatycznie
  poza tym, co sprawdza `smoke.sql` (TD-003).
- **Martwy endpoint** `GET /api/quiz/sessions/[id]/questions/[seq]` (TD-001).
- Nazwy rang oznaczone w kodzie jako „robocze, do akceptacji przez DRE”.
- Komórki `ZN` w Excelu (5 przypadków przy „wysokość 224cm” dla SUPREME)
  są pomijane jako niejednoznaczne — znaczenie nieustalone.

## Important context for next agent

1. **Przeczytaj `/CLAUDE.md`** — sekcje „Critical invariants” i „Known traps”
   zawierają rzeczy, na których ten projekt już raz się wywrócił
   (limit 1000 wierszy PostgREST, kod wyjścia w potokach, `src/proxy.ts`
   zamiast `middleware.ts`).
2. **Nie da się dotknąć produkcyjnej bazy z tej sesji.** Wszystko, co wymaga
   Supabase, kończy się instrukcją dla człowieka albo workflowem w Actions.
3. **Każda nowa migracja to zadanie dla użytkownika** — powiedz o niej
   wprost, podaj link do pliku i zadbaj, by kod działał przed jej wykonaniem.
4. **Właściciel produktu jest nietechniczny.** Odpowiedzi po polsku, bez
   żargonu, z jasną listą „co masz kliknąć”. Zmiany są testowane ręcznie na
   telefonie i tablecie — układ mobilny ma priorytet.
5. **Testy są tanie i szybkie** (`npm test` ~3 s, `./scripts/db-test.sh`
   ~kilkanaście s). Uruchamiaj je zawsze; `npm run build` łapie błędy
   surowych reguł `react-hooks`, których lint w IDE może nie pokazać.
6. **Dokumentację aktualizujesz razem z kodem** — `STATUS.md` po każdym
   większym zadaniu, wpis w `CHANGELOG_AI.md` po każdym.
