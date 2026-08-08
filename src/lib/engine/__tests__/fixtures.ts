import type {
  CatalogSnapshot,
  DoorModelData,
  FeatureData,
  ModelFeatureCell,
  TheoryQuestionData,
} from "../types";

/**
 * Katalog testowy: 12 modeli w 3 kolekcjach, 10 cech (5 technicznych,
 * 4 dekory w 2 grupach, 1 wycofana — poza pulą pytań), 30 pytań teorii.
 */
export function makeSnapshot(): CatalogSnapshot {
  const collections = ["Nova", "Deco", "Vetro"];
  const models: DoorModelData[] = [];
  for (let c = 0; c < collections.length; c++) {
    for (let i = 1; i <= 4; i++) {
      const id = `m-${collections[c].toLowerCase()}-${i}`;
      models.push({
        id,
        name: `${collections[c]} ${String(i).padStart(2, "0")}`,
        collection: collections[c],
        originalOrientation: "right",
        photoOriginalPath: `photos/${id}-a.jpg`,
        photoMirroredPath: `photos/${id}-b.jpg`,
        eligibleLeftRight: true,
        eligibleModelGuess: true,
      });
    }
  }

  const features: FeatureData[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `feat-${i + 1}`,
      name: `Cecha ${i + 1}`,
      category: "dodatkowe informacje",
      imagePath: null,
    })),
    // nazwa z sufiksem kolizyjnym — prompt ma pokazać „Orzech”, nie „Orzech (CPL)”
    { id: "feat-6", name: "Orzech (CPL)", category: "CPL", imagePath: "dekory/orzech-cpl.jpg" },
    { id: "feat-7", name: "Dąb sonoma", category: "CPL", imagePath: null },
    { id: "feat-8", name: "Orzech (cell)", category: "cell", imagePath: "dekory/orzech-cell.jpg" },
    { id: "feat-9", name: "Biel", category: "cell", imagePath: null },
    { id: "feat-10", name: "Dekor wycofany", category: "wycofane", imagePath: null },
  ];

  // Deterministyczna, zróżnicowana macierz: ~połowa komórek na TAK.
  const matrix: ModelFeatureCell[] = [];
  models.forEach((m, mi) => {
    features.forEach((f, fi) => {
      matrix.push({
        modelId: m.id,
        featureId: f.id,
        hasFeature: (mi + fi) % 2 === 0,
      });
    });
  });

  const theory: TheoryQuestionData[] = Array.from({ length: 30 }, (_, i) => ({
    id: `th-${i + 1}`,
    category: i % 2 === 0 ? "budowa" : "okleiny",
    question: `Pytanie teoretyczne nr ${i + 1}?`,
    answers: ["Odpowiedź A", "Odpowiedź B", "Odpowiedź C", "Odpowiedź D"],
    correctIndex: i % 4,
    explanation: `Wyjaśnienie ${i + 1}.`,
  }));

  return { models, features, matrix, theory };
}
