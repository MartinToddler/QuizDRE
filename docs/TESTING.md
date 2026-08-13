# TESTING

## Strategia w jednym akapicie

Testujemy **reguły**, nie interfejs. Cała logika domenowa (generowanie pytań,
proporcje, XP, streak, parser Excela) jest czystym TS i ma testy jednostkowe
w vitest. Reguły gry po stronie bazy (punktacja, limity, RLS, kaskady) są
sprawdzane testem integracyjnym SQL na prawdziwym PostgreSQL. **UI nie ma
testów automatycznych** — weryfikacja ręczna przez właściciela produktu
(patrz `TECH_DEBT.md`, TD-005).

## Frameworki i konfiguracja

| Element | Wartość |
|---|---|
| Framework jednostkowy | **vitest 4** (`vitest.config.ts`) |
| Środowisko | `node` (bez jsdom — nie testujemy DOM) |
| Wzorce plików | `src/**/*.test.ts`, `scripts/**/*.test.ts` |
| Alias | `@` → `src` |
| Testy bazy | `./scripts/db-test.sh` + `supabase/tests/smoke.sql` (psql) |
| E2E | **brak** (świadomie, MVP) |
| Coverage | **brak** progu i raportu — nie skonfigurowano |

## Co jest przetestowane

### Unit (vitest) — 5 plików

| Plik | Zakres |
|---|---|
| `src/lib/engine/__tests__/generators.test.ts` | dostępność typów, balans TAK/NIE, dedupe, dystraktory spoza kolekcji, balans liter A–D, podział technika/dekory, wariant ABCD, proporcje (`question_mix`), długość Quizu Dnia, determinizm |
| `src/lib/engine/__tests__/feature-copy.test.ts` | `foldName()`, `technicalCopy()` (trafienia/`null`), prompt techniczny vs fallback |
| `src/lib/engine/__tests__/xp.test.ts` | bonusy za szybkość/combo, soft cap, progi rang |
| `src/lib/engine/__tests__/streak.test.ts` | naliczanie serii, zamrożenia, „pierwsza aktywność dziś” |
| `scripts/lib/__tests__/catalog-xlsx.test.ts` | parser **prawdziwego** arkusza `materialy/cechy/*.xlsx`, dopasowanie modeli do kolekcji, kompletność `TECHNICAL_FEATURE_COPY` |

Fixtures: `src/lib/engine/__tests__/fixtures.ts` — `makeSnapshot()` buduje
`CatalogSnapshot` (12 modeli w 3 kolekcjach, 10 cech: 5 technicznych,
4 dekory w 2 grupach, 1 „wycofana”, 30 pytań teorii).

**Determinizm:** testy nigdy nie używają `Math.random()` — losowość wstrzykuje
się jako `mulberry32(seed)` (`src/lib/engine/rng.ts`). Dzięki temu asercje na
rozkładach są stabilne.

**Mockowanie:** brak bibliotek mockujących. Silnik przyjmuje dane jako
argument, więc testy podają własne `CatalogSnapshot`. Warstwa `src/lib/db`
i komponenty **nie są mockowane ani testowane**.

### Integracyjne SQL — `supabase/tests/smoke.sql`

Uruchamiane przez `./scripts/db-test.sh` (tymczasowy klaster PG, migracje
0001→0012, granty jak w Supabase, potem asercje). 11 bloków:

1. rejestracja (trigger tworzy profil + statystyki),
2. seed katalogu,
3. sesja nauki: XP z bonusem, `already_answered`, `too_fast`, reset combo,
   3b. prefetch (odpowiedź bez `served_at` → bez bonusu i bez kary),
   3c. dekory (kategoria `dekory`, `swatch_path`),
   3d. limit czasu (po limicie = błędna, `{"timeout":true}` = błędna),
4. `finish_session`: bonusy, streak, odznaki, **inwariant `total_xp` = suma `xp_events`**, idempotencja,
5. wyzwanie: błąd kończy grę, `session_not_active`, rekord,
6. jedna aktywna sesja na użytkownika,
7. rankingi (4 funkcje),
8. **RLS**: klient nie widzi `session_questions`, `door_models`,
   `theory_questions`, `daily_quiz`; funkcje gry niedostępne dla `authenticated`,
9. role: nadanie service role, izolacja RLS, odrzucony self-grant, `has_role`,
10. `app_settings`: zapis/odczyt service role, niewidoczność dla klienta,
11. usunięcie konta: kaskada czyści cały postęp, `granted_by`/`updated_by`
    → NULL, dane innych użytkowników nietknięte.

## Ostatnie uruchomienie (2026-08-13, commit `3edf8a9` + dokumentacja)

| Komenda | Wynik |
|---|---|
| `npx vitest run` | ✅ 5 plików, **64 testy** przechodzą |
| `npm run typecheck` | ✅ bez błędów |
| `npm run lint` | ✅ bez błędów i ostrzeżeń |
| `npm run build` | ✅ kompilacja OK (25 tras) |
| `./scripts/db-test.sh` | ✅ `SMOKE TEST OK` (migracje 0001→0012) |

## Tests required before commit

Minimum: `npm test` + `npm run typecheck` + `npm run lint`.
`npm run build` — gdy zmieniałeś strony/komponenty/konfigurację.
`./scripts/db-test.sh` — gdy dotknąłeś czegokolwiek w `supabase/`.

**Nie ufaj potokom:** `npm run lint | tail` zwraca kod 0 nawet przy błędach.
Loguj do pliku i sprawdzaj kod wyjścia.

## Tests required after modifying X

| Zmieniasz | Uruchom |
|---|---|
| UI / komponenty / style | `npm run lint`, `npm run typecheck`, `npm run build` (+ ręczne sprawdzenie na telefonie — brak testów UI) |
| `src/lib/engine/**` | `npx vitest run` (obowiązkowo), potem `npm run typecheck` |
| formuły XP / streak / limity czasu | `npx vitest run` **i** `./scripts/db-test.sh` (formuły są w dwóch miejscach) |
| `supabase/migrations/**` | `./scripts/db-test.sh` (dopisz najpierw blok asercji w `smoke.sql`) |
| `src/lib/db/**`, `src/lib/quiz/**` | `npm run typecheck`, `npm run build`; jeśli logika dotyka reguł gry — `./scripts/db-test.sh` |
| autoryzacja / role / `proxy.ts` | `./scripts/db-test.sh` (bloki RLS i ról) + ręczny test: konto bez roli nie wchodzi na `/admin` |
| parser Excela / importery | `npx vitest run scripts` (testy chodzą na prawdziwym pliku z `materialy/`) |
| `scripts/import/*` bez zmian parsera | uruchom skrypt z `--dry-run` i przeczytaj raport |

## Czego nie testujemy (świadome luki)

- `src/components/quiz/game.tsx` — najbardziej złożony plik w repo (timer,
  prefetch, bottom-sheet, dogrywka) **bez żadnych testów**.
- Server actions i route handlery — brak testów integracyjnych HTTP.
- Przepływ auth (OAuth, callback, redirecty w `proxy.ts`).
- Edge Function push.
- Brak testów wizualnych/regresji layoutu; jednorazowo layout gry
  zweryfikowano pomiarem w Playwright (nie ma tego w repo jako testu).
