/**
 * Indywidualna składnia pytań o cechy TECHNICZNE.
 *
 * Nazwy kolumn z Excela to frazy w mianowniku („izolacja akustyczna
 * Rw=37dB”) — wstrzyknięte wprost do zdania brzmią źle. Każda kolumna
 * grupy „dodatkowe informacje” ma tu własne pytanie ({model} = nazwa
 * skrzydła) i `label` do wyjaśnień. Nowa/nieznana kolumna dostaje
 * bezpieczny fallback w generatorze, a test na realnym arkuszu
 * (scripts/lib/__tests__/catalog-xlsx.test.ts) wymusza dopisanie wpisu.
 *
 * Klucz mapy = foldName(nazwa kolumny) — wielkość liter, odstępy
 * i diakrytyki bez znaczenia.
 */

export interface TechnicalCopy {
  /** Pełne pytanie z placeholderem {model}. */
  question: string;
  /** Fraza cechy do wyjaśnienia („…” — MODEL: TAK/NIE). */
  label: string;
}

/** Normalizacja nazw do porównań: małe litery, bez diakrytyków, jedna spacja. */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/\s+/g, " ")
    .trim();
}

const COPY: Record<string, TechnicalCopy> = {
  "krawedz bezprzylgowa": {
    question: "Czy skrzydło {model} jest dostępne w wersji bezprzylgowej?",
    label: "wersja bezprzylgowa",
  },
  "odwrotna przylga": {
    question: "Czy skrzydło {model} jest dostępne z odwrotną przylgą?",
    label: "odwrotna przylga",
  },
  "wypelnienie pwo": {
    question: "Czy skrzydło {model} ma wypełnienie płytą wiórową otworową (PWO)?",
    label: "wypełnienie PWO (płyta wiórowa otworowa)",
  },
  "wypelnienie pwp": {
    question: "Czy skrzydło {model} ma wypełnienie płytą wiórową pełną (PWP)?",
    label: "wypełnienie PWP (płyta wiórowa pełna)",
  },
  "wysokosc 211 cm": {
    question: "Czy skrzydło {model} jest dostępne w wysokości 211 cm?",
    label: "wysokość 211 cm",
  },
  "wysokosc 224cm": {
    question: "Czy skrzydło {model} jest dostępne w wysokości 224 cm?",
    label: "wysokość 224 cm",
  },
  "wysokosc 230 cm": {
    question: "Czy skrzydło {model} jest dostępne w wysokości 230 cm?",
    label: "wysokość 230 cm",
  },
  dwuskrzydlowe: {
    question: "Czy {model} można zamówić w wersji dwuskrzydłowej?",
    label: "wersja dwuskrzydłowa",
  },
  "system przesuwny": {
    question: "Czy skrzydło {model} można zamontować w systemie przesuwnym?",
    label: "system przesuwny",
  },
  // literówka w arkuszu („romiar”) — klucz musi jej odpowiadać
  "romiar n": {
    question: "Czy skrzydło {model} jest dostępne w rozmiarze N?",
    label: "rozmiar N",
  },
  "normak sk": {
    question: "Czy skrzydło {model} jest dostępne w wersji Normak Sk?",
    label: "wersja Normak Sk",
  },
  "skrot rekuperacyjny": {
    question:
      "Czy skrzydło {model} może mieć skrót rekuperacyjny (podcięcie wentylacyjne)?",
    label: "skrót rekuperacyjny (podcięcie wentylacyjne)",
  },
  szyba: {
    question: "Czy skrzydło {model} występuje w wersji z szybą?",
    label: "wersja z szybą",
  },
  intarsja: {
    question: "Czy skrzydło {model} występuje w wersji z intarsją?",
    label: "intarsja",
  },
  wstawka: {
    question: "Czy skrzydło {model} występuje w wersji ze wstawką?",
    label: "wstawka",
  },
  "3 zawias estetic80 - doplata": {
    question:
      "Czy do skrzydła {model} można zamówić trzeci zawias Estetic 80 (za dopłatą)?",
    label: "trzeci zawias Estetic 80 (dopłata)",
  },
  "czarny zawias (w wersji przylgowej)": {
    question: "Czy skrzydło {model} może mieć czarny zawias (w wersji przylgowej)?",
    label: "czarny zawias (wersja przylgowa)",
  },
  "zawias zloty/bialy (bezprzylgowe / oro)": {
    question:
      "Czy skrzydło {model} może mieć zawias złoty lub biały (wersje bezprzylgowe / ORO)?",
    label: "zawias złoty/biały (bezprzylgowe / ORO)",
  },
  "zawias regulowany do skrzydla przylgowego - doplata": {
    question:
      "Czy do przylgowego skrzydła {model} można zamówić zawias regulowany (za dopłatą)?",
    label: "zawias regulowany do skrzydła przylgowego (dopłata)",
  },
  ei30: {
    question: "Czy skrzydło {model} jest dostępne w wersji przeciwpożarowej EI30?",
    label: "odporność ogniowa EI30",
  },
  ei60: {
    question: "Czy skrzydło {model} jest dostępne w wersji przeciwpożarowej EI60?",
    label: "odporność ogniowa EI60",
  },
  "drzwi przeciwpozarowe p.poz.": {
    question: "Czy {model} występuje jako drzwi przeciwpożarowe (P.POŻ.)?",
    label: "drzwi przeciwpożarowe (P.POŻ.)",
  },
  "izolacja akustyczna rw=32db": {
    question:
      "Czy skrzydło {model} oferuje izolację akustyczną na poziomie Rw = 32 dB?",
    label: "izolacja akustyczna Rw = 32 dB",
  },
  "izolacja akustyczna rw=37db": {
    question:
      "Czy skrzydło {model} oferuje izolację akustyczną na poziomie Rw = 37 dB?",
    label: "izolacja akustyczna Rw = 37 dB",
  },
  "pakiet silent rw=37db": {
    question: "Czy skrzydło {model} jest dostępne z pakietem SILENT (Rw = 37 dB)?",
    label: "pakiet SILENT (Rw = 37 dB)",
  },
  "izolacja akustyczna rw=42 db": {
    question:
      "Czy skrzydło {model} oferuje izolację akustyczną na poziomie Rw = 42 dB?",
    label: "izolacja akustyczna Rw = 42 dB",
  },
};

/** Szablon pytania dla cechy technicznej albo null (→ fallback w generatorze). */
export function technicalCopy(featureName: string): TechnicalCopy | null {
  return COPY[foldName(featureName)] ?? null;
}
