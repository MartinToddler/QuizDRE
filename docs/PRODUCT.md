# PRODUCT — czym jest QuizDRE

## Product vision

Aplikacja webowa (PWA, instalowalna na telefonie) do **szkolenia ze znajomości
katalogu drzwi DRE** w formie krótkiego, grywalizowanego quizu. Zamiast czytać
cennik i specyfikacje, handlowiec „przegrywa” wiedzę w seriach po 20 pytań
i rywalizuje w rankingach.

Język interfejsu: **polski** (trasy, copy, komunikaty błędów — wszystko po
polsku; kod i dokumentacja techniczna też prowadzone po polsku).

## Problem

Katalog DRE to setki modeli skrzydeł w wielu kolekcjach, każdy z własną
macierzą cech technicznych i dostępnych dekorów. Doradca musi z pamięci
odpowiadać klientowi na pytania typu „czy ten model da się zamówić bezprzylgowy
/ w wysokości 230 cm / w dębie sonoma” oraz rozpoznawać, czy skrzydło na
zdjęciu jest prawe czy lewe. Nauka z arkusza Excel jest nużąca i nie zostaje
w głowie; brakuje mechanizmu sprawdzania i utrwalania.

## Target users

- **Główni:** handlowcy i doradcy salonów sprzedających drzwi DRE (także
  partnerzy zewnętrzni — stąd wybór firmy w profilu i osobny ranking firm).
- **Administrator produktu:** osoba po stronie DRE, która wgrywa dane
  (zdjęcia, Excel, teoria), pisze pytania teoretyczne i steruje proporcjami
  pytań. Ma rolę `admin` i dostęp do panelu `/admin`.
- Rejestracja jest **otwarta** (każdy z adresem e-mail może założyć konto) —
  decyzja właściciela produktu; brak weryfikacji domeny firmowej.

## Core experience

1. Wchodzę na dashboard: widzę serię dni (🔥), rangę, postęp do następnej,
   Quiz Dnia i misje dzienne.
2. Wybieram **Naukę** (20 pytań, feedback po każdym) albo **Wyzwanie**
   (survival — pierwszy błąd kończy grę).
3. Pytanie mieści się na jednym ekranie bez przewijania: pasek postępu,
   licznik czasu, treść, zdjęcie drzwi, odpowiedzi.
4. Odpowiadam pod presją czasu (20 s nauka / 12 s wyzwanie). Po tapnięciu
   z dołu wysuwa się panel z werdyktem, komentarzem narratora i wyjaśnieniem.
5. Na koniec ekran wyniku: XP, bonusy, seria, awans rangi, nowe odznaki,
   ukończone misje — plus wejście w rankingi.

Ton narratora: lekko sarkastyczny, ale szczerze chwalący, mało emoji, copy
neutralne płciowo (`src/lib/engine/narrator.ts`).

## Main features

### IMPLEMENTED

**Typy pytań** (`src/lib/engine/generators.ts`):
- `feature_yn` — cechy z Excela w dwóch wariantach: TAK/NIE („Czy skrzydło X
  jest dostępne w wersji bezprzylgowej?”) oraz ABCD („Która z poniższych cech
  występuje w skrzydle X?”). Dzieli się na dwie kategorie nauki: **technika**
  i **dekory**.
- `left_right` — PRAWE/LEWE ze zdjęcia, losowo odbijanego w poziomie.
- `model_guess` — „Jaki to model?” ABCD; dystraktory spoza kolekcji celu.
- `theory` — pytania ABCD wpisywane ręcznie w panelu admina.

**Tryby:** Nauka (20 pytań, wybór jednej/kilku/wszystkich kategorii),
Wyzwanie (survival + rekord życiowy), Quiz Dnia (ten sam zestaw dla
wszystkich, jedno podejście, długość ustawiana przez admina).

**Grywalizacja:** XP z bonusem za szybkość i combo, dzienny soft cap,
10 rang, seria dni ze „zamrożeniami”, 20 odznak, 3 misje dzienne,
6 rankingów (dziś / miesiąc / od początku / wyzwanie / Quiz Dnia / firmy).

**Konta:** rejestracja e-mail + hasło, logowanie Google (OAuth), onboarding
(nick, opcjonalna firma, godzina przypomnienia).

**Panel admina** (`/admin`): CRUD pytań teoretycznych, globalne proporcje
kategorii pytań, długość Quizu Dnia, tabela użytkowników ze wskaźnikami
zaangażowania, trwałe usuwanie konta wraz z postępem.

**Anti-cheat:** poprawne odpowiedzi nigdy nie opuszczają serwera przed
odpowiedzią; limit czasu egzekwowany w SQL; zdjęcia w prywatnym buckecie.

**Import danych:** zdjęcia (+ automatyczne lustra), macierz cech z Excela,
pytania teoretyczne z JSON, próbki dekorów — skrypty `scripts/import/*`
uruchamiane lokalnie lub przez GitHub Actions.

### PARTIALLY IMPLEMENTED

- **Powiadomienia push (PWA).** Kod kompletny: service worker (`public/sw.js`),
  klient (`src/lib/push/client.ts`), tabele i funkcja `get_reminder_recipients`
  (`supabase/migrations/0005_push.sql`), Edge Function
  (`supabase/functions/send-reminders/index.ts`), harmonogram
  (`supabase/setup/cron.sql`). **Brakuje wdrożenia** — Edge Function, klucze
  VAPID i pg_cron wymagają ręcznej konfiguracji przez właściciela projektu.
- **Pytania teoretyczne.** Mechanika działa, ale treść to 31 szkiców
  wygenerowanych bez katalogu produktowego
  (`materialy/teoria/pytania-teoria.json`) — czekają na weryfikację
  merytoryczną; katalog PDF nie został jeszcze dostarczony
  (`materialy/katalog/` puste).
- **Próbki dekorów.** Pytania o dekory obsługują miniaturę koloru
  (`features.image_path`, importer `scripts/import/dekory.ts`), ale
  `materialy/dekory/` jest puste — obecnie pokazuje się samo zdjęcie modelu.
- **Ranking firm.** Zaimplementowany, ale wymaga min. 3 aktywnych osób
  w firmie; przy obecnej liczbie kont bywa pusty.

### PLANNED

Z README (sekcja „Roadmapa (post-MVP)”) i ustaleń z właścicielem produktu —
brak kodu w repo: mikrolekcje po błędnej odpowiedzi, ligi tygodniowe,
pojedynki 1v1, tryb „60 sekund”, aplikacja mobilna Expo (silnik już
przygotowany na przenośność), pytania teoretyczne generowane z katalogu PDF.
Szczegóły i kolejność: `ROADMAP.md`.

### UNKNOWN / REQUIRES DECISION

- Ostateczne **nazwy rang** — w kodzie oznaczone jako „robocze, do akceptacji
  przez DRE” (`src/lib/engine/xp.ts`).
- Znaczenie kilku kolumn Excela potwierdzone tylko ustnie („Normak Sk”,
  „skrót rekuperacyjny”); komórki `ZN` w arkuszu są pomijane jako
  niejednoznaczne (`scripts/lib/catalog-xlsx.ts`).
- Czy oryginalne zdjęcia przedstawiają skrzydła **prawe** — założono, że tak
  (`--orientation right`); nie potwierdzone testem na produkcji.

## Terminology

Słownik obowiązujący w kodzie, UI i dokumentacji:

| Pojęcie | Znaczenie |
|---|---|
| **Kolekcja** | rodzina modeli w katalogu DRE (np. „Vetro D2”, „City SUPREME”); wiersz w Excelu cech |
| **Model** | konkretne skrzydło (np. „VETRO D2 20”); rekord w `door_models`, nazwa = nazwa pliku zdjęcia |
| **Cecha** (`feature`) | kolumna z Excela; dzieli się na **technikę** i **dekory** |
| **Technika** | cechy z grupy „dodatkowe informacje” (przylgi, wysokości, zawiasy, EI30/EI60, akustyka) — 26 kolumn |
| **Dekor** | wariant kolorystyczny/okleina (grupy CPL, cell, połyskowe, laminat, WOOD…) — ~97 kolumn |
| **Wycofane** | grupa dekorów wyłączona z puli pytań (`featureKind()` zwraca `null`) |
| **Prawe / lewe** | kierunek skrzydła: patrzysz od strony, na którą się otwiera — zawiasy po prawej = prawe |
| **Nauka** | tryb: 20 pytań z wybranych kategorii, feedback po każdym |
| **Wyzwanie** | tryb survival: jeden błąd kończy serię, liczy się rekord |
| **Quiz Dnia** | jeden wspólny zestaw na dobę (Europe/Warsaw), jedno podejście |
| **Combo** | liczba poprawnych odpowiedzi z rzędu w sesji (bonus XP) |
| **Seria / streak** | liczba kolejnych dni z aktywnością (min. 5 odpowiedzi dziennie) |
| **Zamrożenie** (`freeze`) | „tarcza” ratująca serię przy jednym dniu przerwy; max 2, zdobywane co 7 dni serii |
| **Ranga** | próg XP z nazwą (10 poziomów, `RANKS` w `src/lib/engine/xp.ts`) |
| **Misja** | dzienne zadanie z nagrodą XP (3 stałe misje) |
| **Odznaka** (`badge`) | trwałe osiągnięcie (20 sztuk, tabela `badges`) |
| **Proporcje / question mix** | globalne wagi kategorii pytań (`app_settings.question_mix`) |
| **Narrator** | warstwa copy komentująca odpowiedzi (`src/lib/engine/narrator.ts`) |
