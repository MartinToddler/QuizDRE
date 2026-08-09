import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Podstawowe enumy                                                    */
/* ------------------------------------------------------------------ */

export const QTYPES = ["feature_yn", "left_right", "model_guess", "theory"] as const;
export type QType = (typeof QTYPES)[number];

export const MODES = ["learning", "challenge", "daily"] as const;
export type Mode = (typeof MODES)[number];

export const CATEGORIES = [
  "models",
  "technical",
  "dekory",
  "left_right",
  "theory",
  "mix",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Kategoria trybu nauki → typ pytania. */
export const CATEGORY_TO_QTYPE: Record<Exclude<Category, "mix">, QType> = {
  models: "model_guess",
  technical: "feature_yn",
  dekory: "feature_yn",
  left_right: "left_right",
  theory: "theory",
};

/**
 * Rodzaj cechy z arkusza katalogu: 26 kolumn „dodatkowe informacje” to
 * technika, pozostałe grupy (cell, CPL, połyskowe…) to dekory/kolory.
 * Grupa „wycofane” wraca jako null — poza pulą pytań (jej „x” oznacza
 * status wycofania, nie zwykłą dostępność katalogową).
 */
export type FeatureKind = "technical" | "dekor";

export function featureKind(category: string | null): FeatureKind | null {
  if (category === null) return "technical"; // dane seedowe bez kategorii
  const c = category.trim().toLowerCase();
  if (c === "wycofane") return null;
  return c.includes("dodatkowe informacje") ? "technical" : "dekor";
}

export type Orientation = "left" | "right";

export function flipOrientation(o: Orientation): Orientation {
  return o === "left" ? "right" : "left";
}

/* ------------------------------------------------------------------ */
/* Payload pytania (jedyne, co widzi klient) i format odpowiedzi       */
/* ------------------------------------------------------------------ */

export type QuestionPayload =
  // 2 opcje = wariant TAK/NIE, 4 opcje = wariant „która cecha?” (ABCD)
  | { qtype: "feature_yn"; prompt: string; options: string[] }
  | { qtype: "left_right"; prompt: string; options: readonly ["LEWE", "PRAWE"]; hasImage: true }
  | { qtype: "model_guess"; prompt: string; options: string[]; hasImage: true }
  | { qtype: "theory"; prompt: string; options: string[] };

/**
 * Odpowiedź — ten sam kształt po stronie klienta (given_answer)
 * i serwera (correct_answer); porównanie to równość jsonb w SQL.
 */
export const answerValueSchema = z.union([
  z.object({ value: z.enum(["TAK", "NIE", "LEWE", "PRAWE"]) }).strict(),
  z.object({ index: z.number().int().min(0).max(3) }).strict(),
]);
export type AnswerValue = z.infer<typeof answerValueSchema>;

/** Pytanie wygenerowane przez silnik — correct/imagePath NIGDY nie idą do klienta. */
export interface GeneratedQuestion {
  qtype: QType;
  dedupeKey: string;
  payload: QuestionPayload;
  correctAnswer: AnswerValue;
  explanation: string | null;
  /** Ścieżka w prywatnym buckecie; serwer podmienia na signed URL przy serwowaniu. */
  imagePath: string | null;
  /** Próbka dekoru (pytania o dekory) — jak imagePath, signed URL przy serwowaniu. */
  swatchPath: string | null;
}

/* ------------------------------------------------------------------ */
/* Dane katalogowe (porty — implementacje w src/lib/db)                */
/* ------------------------------------------------------------------ */

export interface DoorModelData {
  id: string;
  name: string;
  collection: string | null;
  originalOrientation: Orientation;
  photoOriginalPath: string | null;
  photoMirroredPath: string | null;
  eligibleLeftRight: boolean;
  eligibleModelGuess: boolean;
}

export interface FeatureData {
  id: string;
  name: string;
  /** Grupa z arkusza („dodatkowe informacje”, „CPL”, „cell”…) — patrz featureKind. */
  category: string | null;
  /** Próbka dekoru w prywatnym buckecie (import: scripts/import/dekory.ts). */
  imagePath: string | null;
}

export interface ModelFeatureCell {
  modelId: string;
  featureId: string;
  hasFeature: boolean;
}

export interface TheoryQuestionData {
  id: string;
  category: string;
  question: string;
  answers: string[];
  correctIndex: number;
  explanation: string | null;
}

/** Migawka katalogu ładowana raz na generację (dane są małe). */
export interface CatalogSnapshot {
  models: DoorModelData[];
  features: FeatureData[];
  matrix: ModelFeatureCell[];
  theory: TheoryQuestionData[];
}

/* ------------------------------------------------------------------ */
/* Schematy wejścia API                                                */
/* ------------------------------------------------------------------ */

export const startSessionSchema = z.object({
  mode: z.enum(MODES),
  /** Pojedyncza kategoria — stare linki/klienty. */
  category: z.enum(CATEGORIES).optional(),
  /** Wybór wielu kategorii nauki (pusta lista lub „mix” = wszystkie). */
  categories: z.array(z.enum(CATEGORIES)).max(8).optional(),
  /**
   * Id aktywnej sesji do wznowienia (z parametru `sesja` w URL gry).
   * Tylko odświeżenie/powrót na kartę wznawia — świadomy start z pickera
   * nie wysyła tego pola i zawsze zaczyna nową sesję.
   */
  resume: z.string().uuid().optional(),
});

export const submitAnswerSchema = z.object({
  position: z.number().int().min(1),
  answer: answerValueSchema,
});
