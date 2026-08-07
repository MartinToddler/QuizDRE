import { chance, pick, randInt, shuffle, weightedPick, type Rng } from "./rng";
import {
  CATEGORY_TO_QTYPE,
  flipOrientation,
  type CatalogSnapshot,
  type Category,
  type DoorModelData,
  type GeneratedQuestion,
  type QType,
} from "./types";

/** Minimalna pula, by typ pytań był dostępny (inaczej kategoria ukryta). */
export const MIN_POOL_FOR_TYPE = 8;
export const LEARNING_SESSION_SIZE = 20;
export const CHALLENGE_BATCH_SIZE = 10;
export const DAILY_QUIZ_TEMPLATE: readonly QType[] = [
  "theory",
  "theory",
  "theory",
  "feature_yn",
  "feature_yn",
  "feature_yn",
  "model_guess",
  "model_guess",
  "left_right",
  "left_right",
];

export const ORIENTATION_EXPLANATION =
  "Zasada: patrzysz na drzwi od strony, na którą się otwierają (widzisz zawiasy). " +
  "Zawiasy po prawej = drzwi prawe, zawiasy po lewej = drzwi lewe.";

/* ------------------------------------------------------------------ */
/* Stan generacji (balans + dedupe) — odtwarzalny z bazy przy dogrywce */
/* ------------------------------------------------------------------ */

export interface GenState {
  usedKeys: Set<string>;
  yesCount: number;
  noCount: number;
  /** Ile razy poprawna odpowiedź wypadła na literze A/B/C/D. */
  letterCounts: [number, number, number, number];
  /** Pytania teoretyczne z ostatnich sesji użytkownika — unikamy powtórek. */
  recentTheoryIds: Set<string>;
}

export function newGenState(init?: Partial<GenState>): GenState {
  return {
    usedKeys: init?.usedKeys ?? new Set(),
    yesCount: init?.yesCount ?? 0,
    noCount: init?.noCount ?? 0,
    letterCounts: init?.letterCounts ?? [0, 0, 0, 0],
    recentTheoryIds: init?.recentTheoryIds ?? new Set(),
  };
}

/* ------------------------------------------------------------------ */
/* Dostępność typów                                                    */
/* ------------------------------------------------------------------ */

function lrPool(snapshot: CatalogSnapshot): DoorModelData[] {
  return snapshot.models.filter(
    (m) => m.eligibleLeftRight && m.photoOriginalPath && m.photoMirroredPath,
  );
}

function guessPool(snapshot: CatalogSnapshot): DoorModelData[] {
  return snapshot.models.filter(
    (m) => m.eligibleModelGuess && m.photoOriginalPath,
  );
}

export function typeAvailability(
  snapshot: CatalogSnapshot,
): Record<QType, number> {
  const guess = guessPool(snapshot);
  return {
    feature_yn: snapshot.matrix.length,
    left_right: lrPool(snapshot).length,
    // Potrzebujemy celu + 3 dystraktorów o unikatowych nazwach.
    model_guess: guess.length >= 4 ? guess.length : 0,
    theory: snapshot.theory.length,
  };
}

export function availableTypes(snapshot: CatalogSnapshot): QType[] {
  const avail = typeAvailability(snapshot);
  return (Object.keys(avail) as QType[]).filter(
    (t) => avail[t] >= MIN_POOL_FOR_TYPE,
  );
}

/* ------------------------------------------------------------------ */
/* Generatory pojedynczych pytań                                       */
/* ------------------------------------------------------------------ */

function computeFeatureShares(snapshot: CatalogSnapshot): Map<string, number> {
  const totals = new Map<string, { has: number; all: number }>();
  for (const cell of snapshot.matrix) {
    const t = totals.get(cell.featureId) ?? { has: 0, all: 0 };
    t.all += 1;
    if (cell.hasFeature) t.has += 1;
    totals.set(cell.featureId, t);
  }
  const shares = new Map<string, number>();
  for (const [id, t] of totals) shares.set(id, t.all > 0 ? t.has / t.all : 0);
  return shares;
}

function genFeature(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion | null {
  const modelById = new Map(snapshot.models.map((m) => [m.id, m]));
  const featureById = new Map(snapshot.features.map((f) => [f.id, f]));
  const cells = snapshot.matrix.filter(
    (c) =>
      !state.usedKeys.has(`f:${c.modelId}:${c.featureId}`) &&
      modelById.has(c.modelId) &&
      featureById.has(c.featureId),
  );
  if (cells.length === 0) return null;

  // Balans TAK/NIE: waga korygująca zależna od dotychczasowej przewagi.
  const diff = state.yesCount - state.noCount;
  const pYes = Math.min(0.9, Math.max(0.1, 0.5 - diff * 0.125));
  const targetYes = chance(rng, pYes);
  let pool = cells.filter((c) => c.hasFeature === targetYes);
  if (pool.length === 0) pool = cells;

  // Cechy trywialne (prawie wszędzie / prawie nigdzie) losowane rzadziej.
  const shares = computeFeatureShares(snapshot);
  const cell = weightedPick(rng, pool, (c) => {
    const share = shares.get(c.featureId) ?? 0.5;
    return share > 0.9 || share < 0.1 ? 0.35 : 1;
  });

  const model = modelById.get(cell.modelId)!;
  const feature = featureById.get(cell.featureId)!;
  if (cell.hasFeature) state.yesCount += 1;
  else state.noCount += 1;
  state.usedKeys.add(`f:${cell.modelId}:${cell.featureId}`);

  return {
    qtype: "feature_yn",
    dedupeKey: `f:${cell.modelId}:${cell.featureId}`,
    payload: {
      qtype: "feature_yn",
      prompt: `Czy „${feature.name}” występuje w modelu ${model.name}?`,
      options: ["TAK", "NIE"],
    },
    correctAnswer: { value: cell.hasFeature ? "TAK" : "NIE" },
    explanation: `„${feature.name}” w modelu ${model.name}: ${cell.hasFeature ? "TAK" : "NIE"}.`,
    imagePath: null,
  };
}

function genLeftRight(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion | null {
  const pool = lrPool(snapshot).filter(
    (m) => !state.usedKeys.has(`lr:${m.id}`),
  );
  if (pool.length === 0) return null;

  const model = pick(rng, pool);
  const mirrored = chance(rng, 0.5);
  const displayed = mirrored
    ? flipOrientation(model.originalOrientation)
    : model.originalOrientation;
  state.usedKeys.add(`lr:${model.id}`);

  return {
    qtype: "left_right",
    dedupeKey: `lr:${model.id}`,
    payload: {
      qtype: "left_right",
      prompt: "Prawe czy lewe skrzydło?",
      options: ["LEWE", "PRAWE"],
      hasImage: true,
    },
    correctAnswer: { value: displayed === "left" ? "LEWE" : "PRAWE" },
    explanation: ORIENTATION_EXPLANATION,
    imagePath: mirrored ? model.photoMirroredPath : model.photoOriginalPath,
  };
}

/** Indeks o najmniejszej liczbie trafień (remisy losowo) — balans liter A–D. */
function leastUsedIndex(state: GenState, rng: Rng, optionCount: number): number {
  const counts = state.letterCounts.slice(0, optionCount);
  const min = Math.min(...counts);
  const candidates = counts
    .map((c, i) => (c === min ? i : -1))
    .filter((i) => i >= 0);
  return candidates[randInt(rng, candidates.length)];
}

function genModelGuess(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion | null {
  const pool = guessPool(snapshot).filter(
    (m) => !state.usedKeys.has(`mg:${m.id}`),
  );
  if (pool.length === 0) return null;

  const target = pick(rng, pool);
  const others = snapshot.models.filter((m) => m.name !== target.name);
  const sameCollection = others.filter(
    (m) => m.collection !== null && m.collection === target.collection,
  );
  const rest = others.filter((m) => !sameCollection.includes(m));

  const distractorNames: string[] = [];
  for (const m of [...shuffle(rng, sameCollection), ...shuffle(rng, rest)]) {
    if (distractorNames.length === 3) break;
    if (!distractorNames.includes(m.name)) distractorNames.push(m.name);
  }
  if (distractorNames.length < 3) return null;

  const correctIndex = leastUsedIndex(state, rng, 4);
  const options: string[] = [];
  let d = 0;
  for (let i = 0; i < 4; i++) {
    options.push(i === correctIndex ? target.name : distractorNames[d++]);
  }
  state.letterCounts[correctIndex] += 1;
  state.usedKeys.add(`mg:${target.id}`);

  return {
    qtype: "model_guess",
    dedupeKey: `mg:${target.id}`,
    payload: {
      qtype: "model_guess",
      prompt: "Jaki to model?",
      options,
      hasImage: true,
    },
    correctAnswer: { index: correctIndex },
    explanation: target.collection
      ? `To ${target.name} z kolekcji ${target.collection}.`
      : `To ${target.name}.`,
    imagePath: target.photoOriginalPath,
  };
}

function genTheory(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion | null {
  let pool = snapshot.theory.filter(
    (q) =>
      !state.usedKeys.has(`t:${q.id}`) && !state.recentTheoryIds.has(q.id),
  );
  if (pool.length === 0) {
    // Fallback: dopuść pytania z ostatnich sesji, byle nie z tej.
    pool = snapshot.theory.filter((q) => !state.usedKeys.has(`t:${q.id}`));
  }
  if (pool.length === 0) return null;

  const q = pick(rng, pool);
  const optionCount = Math.min(q.answers.length, 4);
  const correctText = q.answers[q.correctIndex];
  const distractors = shuffle(
    rng,
    q.answers.filter((_, i) => i !== q.correctIndex),
  ).slice(0, optionCount - 1);

  const correctIndex = leastUsedIndex(state, rng, optionCount);
  const options: string[] = [];
  let d = 0;
  for (let i = 0; i < optionCount; i++) {
    options.push(i === correctIndex ? correctText : distractors[d++]);
  }
  state.letterCounts[correctIndex] += 1;
  state.usedKeys.add(`t:${q.id}`);

  return {
    qtype: "theory",
    dedupeKey: `t:${q.id}`,
    payload: { qtype: "theory", prompt: q.question, options },
    correctAnswer: { index: correctIndex },
    explanation: q.explanation,
    imagePath: null,
  };
}

const GENERATORS: Record<
  QType,
  (s: CatalogSnapshot, st: GenState, r: Rng) => GeneratedQuestion | null
> = {
  feature_yn: genFeature,
  left_right: genLeftRight,
  model_guess: genModelGuess,
  theory: genTheory,
};

export function generateQuestion(
  qtype: QType,
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion | null {
  return GENERATORS[qtype](snapshot, state, rng);
}

/* ------------------------------------------------------------------ */
/* Kompozycja sesji                                                    */
/* ------------------------------------------------------------------ */

function generateOfTypes(
  types: readonly QType[],
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  for (const t of types) {
    const q = generateQuestion(t, snapshot, state, rng);
    if (q) out.push(q);
  }
  return out;
}

/** Sesja trybu nauki: 20 pytań z kategorii (lub mniej, gdy pula mniejsza). */
export function composeLearningSession(
  snapshot: CatalogSnapshot,
  category: Category,
  state: GenState,
  rng: Rng,
): GeneratedQuestion[] {
  if (category !== "mix") {
    const qtype = CATEGORY_TO_QTYPE[category];
    const wanted = Math.min(LEARNING_SESSION_SIZE, typeAvailability(snapshot)[qtype]);
    const out: GeneratedQuestion[] = [];
    while (out.length < wanted) {
      const q = generateQuestion(qtype, snapshot, state, rng);
      if (!q) break;
      out.push(q);
    }
    return out;
  }

  const types = availableTypes(snapshot);
  if (types.length === 0) return [];
  const perType = Math.ceil(LEARNING_SESSION_SIZE / types.length);
  const plan: QType[] = shuffle(
    rng,
    types.flatMap((t) => Array<QType>(perType).fill(t)),
  ).slice(0, LEARNING_SESSION_SIZE);
  return generateOfTypes(plan, snapshot, state, rng);
}

/**
 * Partia pytań wyzwania (mix, długość nieograniczona).
 * Po wyczerpaniu puli dedupe jest zerowane — bardzo długie runy mogą
 * zobaczyć pytanie ponownie, ale gra się nie kończy z braku pytań.
 */
export function composeChallengeBatch(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
  count = CHALLENGE_BATCH_SIZE,
): GeneratedQuestion[] {
  const types = availableTypes(snapshot);
  if (types.length === 0) return [];
  const out: GeneratedQuestion[] = [];
  let exhaustionResets = 0;
  while (out.length < count) {
    const order = shuffle(rng, types);
    let generated: GeneratedQuestion | null = null;
    for (const t of order) {
      generated = generateQuestion(t, snapshot, state, rng);
      if (generated) break;
    }
    if (!generated) {
      if (exhaustionResets >= 1) break;
      state.usedKeys = new Set();
      exhaustionResets += 1;
      continue;
    }
    out.push(generated);
  }
  return out;
}

/** Zestaw Quizu Dnia: 3 teoria / 3 cechy / 2 model / 2 lewe-prawe. */
export function composeDailyQuiz(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
): GeneratedQuestion[] {
  const avail = typeAvailability(snapshot);
  const plan = DAILY_QUIZ_TEMPLATE.filter((t) => avail[t] >= MIN_POOL_FOR_TYPE);
  const out = generateOfTypes(plan, snapshot, state, rng);

  // Uzupełnij braki dowolnym dostępnym typem.
  const types = availableTypes(snapshot);
  while (out.length < DAILY_QUIZ_TEMPLATE.length && types.length > 0) {
    const q = generateQuestion(pick(rng, types), snapshot, state, rng);
    if (!q) break;
    out.push(q);
  }
  return shuffle(rng, out);
}
