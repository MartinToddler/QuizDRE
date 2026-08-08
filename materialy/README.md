# Materiały do quizu — co i gdzie wrzucić

Ten folder to skrzynka na dane źródłowe QuizDRE. Wrzuć pliki według poniższych
zasad (przez stronę GitHuba: **Add file → Upload files**), a skrypty importu
zamienią je w pytania.

## 📁 `cechy/` — specyfikacja kolekcji (Excel)

Obsługiwany format to katalogowy arkusz **„KATALOG specyfikacja
kolekcji.xlsx”**:

- wiersz z „kolekcja / dekor KATALOG” = nagłówek, cechy od kolumny 3
  (kategorie cech w wierszu wyżej),
- wiersze poniżej = **kolekcje** („Ilis”, „Vetro D2”, „Arte”…); sekcje
  typu „DRZWI RAMOWE” pomijane są automatycznie,
- komórki: `x` / `x*` = cecha dostępna, **pusta = niedostępna**,
  inne wartości (np. `ZN`) są raportowane i pomijane.

Importer bierze pierwszy niepusty arkusz (zwykle najnowsze wydanie
katalogu); inne wydanie wskażesz flagą `--sheet`. Cechy kolekcji dostają
wszystkie modele (zdjęcia), których nazwa zaczyna się od nazwy kolekcji —
najdłuższy prefiks wygrywa, np. `VETRO D2 20` → „Vetro D2”, nie „Vetro E”.
Modele bez kolekcji i kolekcje bez zdjęć lądują w raporcie importu.

## 📁 `dekory/` — próbki dekorów (kolorów)

- Nazwa pliku = **nazwa dekoru z Excela**, np. `Dąb sonoma 3D.jpg`,
  `Orzech.png` (rozszerzenia: jpg / jpeg / png / webp). Wielkość liter,
  odstępy i polskie znaki bez znaczenia — `dab sonoma 3d.jpg` też zadziała.
- Jeśli ten sam dekor występuje w kilku technologiach (np. „Orzech” w cell
  i CPL), plik o samej nazwie `Orzech.jpg` będzie niejednoznaczny — nazwij
  go wtedy pełną nazwą z grupą: `Orzech (CPL).jpg`.
- Próbka pokazuje się w pytaniach „czy model występuje w dekorze…” obok
  zdjęcia modelu. Można wgrywać partiami — pytania bez próbki po prostu
  pokazują samo zdjęcie modelu.
- Import: workflow **Import danych quizu** z zakresem `dekory (probki)`
  (wymaga wcześniejszego importu cech).

## 📁 `zdjecia/` — zdjęcia drzwi

- Nazwa pliku = **nazwa modelu**, np. `Nova 10.jpg`, `Berge 4.png`
  (rozszerzenia: jpg / jpeg / png / webp).
- Wszystkie zdjęcia w **tym samym układzie skrzydła** (potwierdzone: jednolity).
- Na tej bazie działają pytania „prawe/lewe” (odbicia lustrzane generujemy
  automatycznie) oraz „jaki to model”.
- Jeśli nazwa modelu zawiera znaki niedozwolone w nazwie pliku — zapisz jak
  się da, import robi dopasowanie przybliżone i raportuje wątpliwości.

## 📁 `katalog/` — katalog produktów

PDF (lub inne pliki) z wiedzą produktową: budowa drzwi, okleiny, przylgowe /
bezprzylgowe, ramowe / płytowe itd. Na tej podstawie przygotujemy pulę pytań
teoretycznych ABCD (trafi do `teoria/` do Twojej akceptacji).

## 📁 `branding/` — referencje wyglądu

Screeny strony dre.pl i inne materiały brandowe (logo, księga znaku).
Na ich podstawie kalibrujemy wygląd aplikacji — kolory z `visual01/02.png`
są już zdjęte pikselowo i wpisane w design tokens
(`#fd7e14`, `#f3ab4e`, `#373737`).

## 📁 `teoria/` — pytania teoretyczne (JSON)

Gotowa pula pytań ABCD w formacie:

```json
{
  "questions": [
    {
      "id": "okleiny-01",
      "category": "okleiny",
      "question": "Która okleina jest najbardziej odporna na zarysowania?",
      "answers": ["CPL", "Folia PVC", "Fornir", "Papier"],
      "correctIndex": 0,
      "explanation": "Laminat CPL ma najwyższą odporność mechaniczną.",
      "difficulty": 2
    }
  ]
}
```

Ten plik generujemy z katalogu i poprawiamy ręcznie — możesz też dopisywać
własne pytania.

---

**Po wrzuceniu plików** daj znać w sesji Claude — uruchomimy import
(`scripts/import/…`), który zwaliduje dane i wypisze raport braków.
