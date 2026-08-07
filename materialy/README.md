# Materiały do quizu — co i gdzie wrzucić

Ten folder to skrzynka na dane źródłowe QuizDRE. Wrzuć pliki według poniższych
zasad (przez stronę GitHuba: **Add file → Upload files**), a skrypty importu
zamienią je w pytania.

## 📁 `cechy/` — macierz cech modeli (Excel)

Plik `.xlsx` z macierzą **modele × cechy**:

- **wiersze** = modele drzwi (pierwsza kolumna: nazwa modelu),
- **kolumny** = cechy / rozwiązania techniczne (pierwszy wiersz: nazwa cechy),
- **komórki**: `TAK` / `NIE` (akceptujemy też `x`, `✓`, `1` / `-`, `0`, puste).

Komórki niejednoznaczne są raportowane i pomijane — nie trafią do pytań.
Jeśli Twój Excel ma inny układ, nic straconego: wrzuć go tak, jak jest,
a dopasujemy import do formatu.

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
