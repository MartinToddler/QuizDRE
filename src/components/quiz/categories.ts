import type { Category } from "@/lib/engine";

/** Opisy kategorii nauki — picker, historia sesji, statystyki. */
export const CATEGORY_INFO: Record<
  Category,
  { title: string; desc: string; icon: string }
> = {
  models: {
    title: "Modele",
    desc: "Zdjęcie drzwi — zgadnij, jaki to model.",
    icon: "🚪",
  },
  technical: {
    title: "Rozwiązania techniczne",
    desc: "Przylgi, wysokości, zawiasy — czy cecha występuje w modelu?",
    icon: "🔧",
  },
  dekory: {
    title: "Dekory",
    desc: "Czy model występuje w danym dekorze? TAK / NIE.",
    icon: "🎨",
  },
  left_right: {
    title: "Prawe / lewe",
    desc: "Spójrz na skrzydło i określ kierunek. Trening oka.",
    icon: "👁️",
  },
  theory: {
    title: "Teoria",
    desc: "Okleiny, budowa, normy — wiedza, która sprzedaje.",
    icon: "🎓",
  },
  mix: {
    title: "Mix",
    desc: "Wszystkie kategorie wymieszane. Pełny trening.",
    icon: "🎲",
  },
};

/** Etykiety typów pytań — statystyki skuteczności (klucze z category_stats). */
export const QTYPE_INFO: Record<string, { title: string; icon: string }> = {
  model_guess: { title: "Modele", icon: "🚪" },
  feature_yn: { title: "Cechy i dekory", icon: "🎨" },
  left_right: { title: "Prawe / lewe", icon: "👁️" },
  theory: { title: "Teoria", icon: "🎓" },
};
