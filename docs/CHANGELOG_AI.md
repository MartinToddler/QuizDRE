# CHANGELOG_AI

Historia prac wykonywanych przez agentów AI w tym repozytorium.

## Jak dopisywać wpisy

Po **każdym zakończonym zadaniu** dodaj wpis na górze sekcji „Wpisy”
(najnowsze pierwsze), w formacie:

```markdown
## YYYY-MM-DD – [krótka nazwa zadania]

Agent:
Scope:

### Changed
- ...

### Files
- ...

### Tests
- ...

### Documentation updated
- ...

### Remaining issues
- ...

### Suggested next step
- ...
```

Zasady:
- „Tests” zawiera **wyniki**, nie intencje (np. „`npx vitest run` — 64/64 OK”).
- Jeśli zadanie wymaga migracji SQL do wklejenia przez człowieka, zapisz to
  w „Remaining issues”.
- Nie oznaczaj zadania jako zakończonego, jeśli testy nie przechodzą.

---

# Wpisy

## 2026-08-13 – Audyt repozytorium i dokumentacja dla agentów

Agent: Claude (Opus 5), sesja `session_018WUoT5u8MEffqTUFb8nrSB`
Scope: dokumentacja + weryfikacja. **Kod aplikacji niezmieniony.**

### Changed
- Przepisany `CLAUDE.md` na entry point dla agentów: tożsamość projektu,
  kolejność lektury, zweryfikowane komendy, reguły architektoniczne, procedury
  BEFORE/AFTER MAKING CHANGES, 8 inwariantów krytycznych, 9 „known traps”.
- Utworzony katalog `docs/` z 13 dokumentami (mapa, produkt, architektura,
  mapa kodu, model danych, przepływy, development, testy, ADR-y, status,
  roadmapa, dług techniczny, ten changelog).
- Audyt wykrył fakty niezapisane wcześniej nigdzie w repo, m.in.:
  martwy endpoint `questions/[seq]` + `serveQuestion()`; trzy wersje
  `submit_answer` w migracjach `0003`/`0006`/`0009`; brak jakiegokolwiek CI;
  zero komentarzy `TODO`/`FIXME` w kodzie; brak `engines`/`.nvmrc`/`vercel.json`;
  pusta konfiguracja `next.config.ts`.

### Files
- `CLAUDE.md` (przepisany; wcześniej zawierał tylko `@AGENTS.md`)
- `docs/README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`,
  `docs/CODEBASE_MAP.md`, `docs/DATA_MODEL.md`, `docs/USER_FLOWS.md`,
  `docs/DEVELOPMENT.md`, `docs/TESTING.md`, `docs/DECISIONS.md`,
  `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/TECH_DEBT.md`,
  `docs/CHANGELOG_AI.md`
- `AGENTS.md` — dopisany jeden akapit kierujący nowego agenta do `CLAUDE.md`
  i `docs/README.md` (zasady krytyczne bez zmian)
- `README.md` — **bez zmian** w tym zadaniu

### Tests
- `npx vitest run` — 5 plików, **64/64** OK
- `npm run typecheck` — OK
- `npm run lint` — OK
- `npm run build` — OK
- `./scripts/db-test.sh` — `SMOKE TEST OK` (migracje 0001→0012)
- Kontrola dokumentacji: skrypt sprawdzający istnienie wszystkich ścieżek
  plików cytowanych w `docs/**` i `CLAUDE.md` — 0 nieistniejących

### Documentation updated
- Cała dokumentacja utworzona w tym zadaniu (patrz „Files”).

### Remaining issues
- **Stan migracji na produkcji jest nieznany z repozytorium.** Migracje
  `0009_time_limit.sql`, `0010_settings.sql`, `0011_daily_quiz_size.sql`,
  `0012_user_delete.sql` mogą wymagać wklejenia w Supabase SQL Editor.
- 15 pozycji długu technicznego (`docs/TECH_DEBT.md`) — świadomie
  nienaprawionych; najpilniejsze: TD-004 (brak CI), TD-005 (brak testów UI),
  TD-006 (ręczne migracje bez rejestru), TD-013 (niezweryfikowany kierunek
  prawe/lewe).
- `AGENTS.md` powtarza część inwariantów z `CLAUDE.md` (TD-015) — nie scalono,
  by nie zmieniać ustalonego pliku bez decyzji właściciela.

### Suggested next step
- Dodać workflow CI (`npm ci && npm test && npm run lint && npm run typecheck
  && npm run build` na push/PR) — najtańsza zmiana o największym wpływie na
  bezpieczeństwo dalszego rozwoju (TD-004, `ROADMAP.md` → NEXT 2).

---

## Wcześniejsza historia (przed wprowadzeniem tego pliku)

Rekonstrukcja z `git log` — **tylko oś czasu**, bez odtwarzania szczegółów,
których nie da się potwierdzić z repozytorium. Pełna lista commitów:
`git log --oneline`.

| Commit | Zakres |
|---|---|
| `d5a144f` | fundament: scaffold, silnik quizu, migracje SQL, folder materiałów |
| `63b7ca3` | warstwa API, UI quizu, dashboard, skrypty importu |
| `4e3ce83` | grywalizacja UI, Quiz Dnia, PWA, powiadomienia push, dokumentacja |
| `4e3a84c`, `9525c7c` | konfigurator Google OAuth, czytelne błędy logowania |
| `c341558`, `bb5fae5`, `5400d79`, `359558a` | import danych DRE: workflow + parser realnego Excela + aliasy kolekcji |
| `e192317`, `b6b7f2b` | UX: prefetch pytań/obrazków, losowe dystraktory |
| `dcdf4ba` | dekory jako osobna kategoria + grafika przy pytaniach o cechy |
| `ac2290f` | multi-wybór kategorii, wznowienie sesji, widoczne statystyki |
| `e9881c4` | gramatyka pytań technicznych, wznowienie tylko przez `?sesja=` |
| `01a8a59` | wariant ABCD pytań o cechy |
| `9696227` | onboarding: firma opcjonalna + samonaprawa listy firm |
| `5b20f09` | fix: paginacja katalogu (limit 1000 wierszy PostgREST) |
| `9f49f81`, `9d728ce` | system ról (RBAC) i panel admina |
| `b15a89f`, `bc1b5b9` | bottom-sheet, limit czasu 20/12 s, ekran gry bez przewijania |
| `562b270`, `bcdcd99` | globalne proporcje pytań, długość Quizu Dnia |
| `3edf8a9` | usuwanie konta wraz z całym postępem |
