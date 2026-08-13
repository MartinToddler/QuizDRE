# Mapa dokumentacji QuizDRE

Dokumentacja jest pisana dla **agentów AI i deweloperów**, nie marketingowo.
Entry point to `/CLAUDE.md` w katalogu głównym — ten plik mówi tylko, gdzie
czego szukać.

## Zasada nadrzędna

**Kod jest źródłem prawdy.** Jeśli dokument jest sprzeczny z kodem, wierz
kodowi i popraw dokument (oraz dopisz wpis do `CHANGELOG_AI.md`).

Statusy używane w całej dokumentacji:

| Status | Znaczenie |
|---|---|
| `IMPLEMENTED` | działa w kodzie, potwierdzone lekturą implementacji |
| `PARTIALLY IMPLEMENTED` | kod istnieje, ale wymaga kroku ręcznego / brakuje części |
| `PLANNED` | zapisane jako zamiar, brak implementacji |
| `DEPRECATED` | kod istnieje, ale nie powinien być używany |
| `UNKNOWN / REQUIRES DECISION` | nie da się ustalić z repozytorium |

## Dokumenty

| Plik | Czego dotyczy | Kiedy czytać | Źródło prawdy dla |
|---|---|---|---|
| `/CLAUDE.md` | zasady pracy agenta, komendy, inwarianty, pułapki | zawsze, jako pierwszy | reguł pracy i inwariantów |
| `PRODUCT.md` | produkt, użytkownicy, funkcje, słownik pojęć | przed zmianami w UX/treści | terminologii domenowej i zakresu funkcjonalnego |
| `ARCHITECTURE.md` | warstwy, przepływ danych, auth, granice, extension points | przed każdą zmianą strukturalną | architektury i kierunku zależności |
| `CODEBASE_MAP.md` | co leży w którym katalogu; „Where do I change X?” | gdy szukasz miejsca na zmianę | lokalizacji kodu |
| `DATA_MODEL.md` | tabele, pola, relacje, RLS, migracje, seed | przed zmianą schematu lub zapytań | modelu danych |
| `USER_FLOWS.md` | przepływy użytkownika krok po kroku | przy zmianach w grze/onboardingu | zachowania aplikacji end-to-end |
| `DEVELOPMENT.md` | uruchomienie od zera, env, baza, import danych | przy pierwszym starcie i problemach środowiskowych | konfiguracji środowiska |
| `TESTING.md` | co i czym testujemy, co uruchomić po zmianie czego | przed i po zmianie kodu | strategii testów |
| `DECISIONS.md` | ADR-y: dlaczego jest tak, jak jest | gdy chcesz zmienić coś fundamentalnego | uzasadnień architektonicznych |
| `STATUS.md` | aktualny stan: done / in progress / blocked / bugs | zawsze przed rozpoczęciem pracy | bieżącego stanu projektu |
| `ROADMAP.md` | co dalej, w jakiej kolejności, z jakimi zależnościami | przy planowaniu kolejnego zadania | planów |
| `TECH_DEBT.md` | zinwentaryzowany dług techniczny z dowodami | przy szacowaniu ryzyka zmiany | znanych słabości |
| `CHANGELOG_AI.md` | historia prac agentów AI | po zakończeniu zadania (dopisujesz wpis) | historii zmian agentowych |

## Dokumenty poza `docs/`

| Plik | Zawartość |
|---|---|
| `/AGENTS.md` | zwięzła lista 8 zasad krytycznych + konwencje; skrót inwariantów z `CLAUDE.md` |
| `/README.md` | README repozytorium: opis, instrukcja uruchomienia od zera, konfiguracja Google OAuth, deploy, push, role |
| `/materialy/README.md` | instrukcja dla właściciela produktu: jakie pliki wrzucać i w jakim formacie (zdjęcia, Excel cech, teoria, dekory) |

## Czego tu nie ma

- **Dokumentacji API dla klientów zewnętrznych** — API (`/api/quiz/**`) jest
  wewnętrzne, używane tylko przez własny frontend; kontrakt opisuje
  `ARCHITECTURE.md`.
- **Dokumentacji aplikacji mobilnej** — nie istnieje (`PLANNED`, patrz
  `ROADMAP.md`); silnik jest przygotowany na przenośność, ale kodu Expo
  w repo nie ma.
