import { technicalCopy } from "./feature-copy";
import { chance, pick, randInt, shuffle, weightedPick, type Rng } from "./rng";
import {
  CATEGORY_TO_QTYPE,
  DEFAULT_QUESTION_MIX,
  featureKind,
  flipOrientation,
  type CatalogSnapshot,
  type Category,
  type DoorModelData,
  type FeatureData,
  type FeatureKind,
  type GeneratedQuestion,
  type ModelFeatureCell,
  type QType,
  type QuestionMix,
} from "./types";

/** Opcje generacji — na razie tylko zawężenie cech do techniki albo dekorów. */
export interface GenerateOptions {
  featureKind?: FeatureKind;
}

/** Minimalna pula, by typ pytań był dostępny (inaczej kategoria ukryta). */
export const MIN_POOL_FOR_TYPE = 8;
export const LEARNING_SESSION_SIZE = 20;
export const CHALLENGE_BATCH_SIZE = 10;
export const DAILY_QUIZ_SIZE = 10;

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

/** Liczba komórek macierzy per rodzaj cechy (bez wykluczonych, np. „wycofane”). */
export function featureKindAvailability(
  snapshot: CatalogSnapshot,
): Record<FeatureKind, number> {
  const kindById = new Map(
    snapshot.features.map((f) => [f.id, featureKind(f.category)]),
  );
  const out: Record<FeatureKind, number> = { technical: 0, dekor: 0 };
  for (const cell of snapshot.matrix) {
    const kind = kindById.get(cell.featureId);
    if (kind) out[kind] += 1;
  }
  return out;
}

export function typeAvailability(
  snapshot: CatalogSnapshot,
): Record<QType, number> {
  const guess = guessPool(snapshot);
  const kinds = featureKindAvailability(snapshot);
  return {
    feature_yn: kinds.technical + kinds.dekor,
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

/** Nazwa dekoru do wyświetlenia — bez sufiksu kolizyjnego „ (grupa)”. */
function featureDisplayName(f: FeatureData): string {
  const suffix = f.category ? ` (${f.category.trim()})` : "";
  return suffix && f.name.endsWith(suffix)
    ? f.name.slice(0, -suffix.length)
    : f.name;
}

/**
 * Fakt „(model, cecha)” zużyty przez KTÓRYKOLWIEK wariant pytania o cechę
 * (f: = TAK/NIE, f4: = ABCD) — twin pary nie wraca w tej samej sesji.
 */
function cellUsed(state: GenState, modelId: string, featureId: string): boolean {
  return (
    state.usedKeys.has(`f:${modelId}:${featureId}`) ||
    state.usedKeys.has(`f4:${modelId}:${featureId}`)
  );
}

/** Etykieta cechy jako opcja odpowiedzi (mianownik, bez sufiksu grupy). */
function featureOptionLabel(f: FeatureData, kind: FeatureKind): string {
  return kind === "dekor"
    ? featureDisplayName(f)
    : (technicalCopy(f.name)?.label ?? f.name);
}

/**
 * Wariant ABCD: „która z tych cech występuje w modelu?” — poprawna to cecha
 * z jawnym TAK, dystraktory to 3 cechy z JAWNYM NIE dla tego modelu (ten sam
 * rodzaj). null, gdy brak modelu z kompletem dystraktorów → fallback TAK/NIE.
 */
function genFeaturePick(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
  cells: ModelFeatureCell[],
  kind: FeatureKind,
  modelById: Map<string, DoorModelData>,
  featureById: Map<string, FeatureData>,
  kindById: Map<string, FeatureKind>,
): GeneratedQuestion | null {
  const trueCells = cells.filter((c) => c.hasFeature);
  if (trueCells.length === 0) return null;

  // Cechy z jawnym NIE per model (kandydaci na dystraktory) — mogą się
  // powtarzać między pytaniami, „zużywa się” tylko fakt poprawny.
  const falseByModel = new Map<string, FeatureData[]>();
  for (const c of snapshot.matrix) {
    if (c.hasFeature || kindById.get(c.featureId) !== kind) continue;
    const f = featureById.get(c.featureId);
    if (!f) continue;
    const list = falseByModel.get(c.modelId) ?? [];
    list.push(f);
    falseByModel.set(c.modelId, list);
  }

  const pool = trueCells.filter(
    (c) => (falseByModel.get(c.modelId)?.length ?? 0) >= 3,
  );
  if (pool.length === 0) return null;

  const shares = computeFeatureShares(snapshot);
  const cell = weightedPick(rng, pool, (c) => {
    const share = shares.get(c.featureId) ?? 0.5;
    return share > 0.9 || share < 0.1 ? 0.35 : 1;
  });
  const model = modelById.get(cell.modelId)!;
  const feature = featureById.get(cell.featureId)!;
  const correctLabel = featureOptionLabel(feature, kind);

  const seenLabels = new Set([correctLabel]);
  const distractors: string[] = [];
  for (const f of shuffle(rng, falseByModel.get(cell.modelId)!)) {
    const label = featureOptionLabel(f, kind);
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    distractors.push(label);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) return null;

  const correctIndex = leastUsedIndex(state, rng, 4);
  const options: string[] = [];
  let d = 0;
  for (let i = 0; i < 4; i++) {
    options.push(i === correctIndex ? correctLabel : distractors[d++]);
  }
  state.letterCounts[correctIndex] += 1;
  state.usedKeys.add(`f4:${cell.modelId}:${cell.featureId}`);

  const isDekor = kind === "dekor";
  return {
    qtype: "feature_yn",
    dedupeKey: `f4:${cell.modelId}:${cell.featureId}`,
    payload: {
      qtype: "feature_yn",
      prompt: isDekor
        ? `W którym z poniższych dekorów występuje model ${model.name}?`
        : `Która z poniższych cech występuje w skrzydle ${model.name}?`,
      options,
    },
    correctAnswer: { index: correctIndex },
    explanation: isDekor
      ? `Model ${model.name} występuje w dekorze „${correctLabel}”; w pozostałych wymienionych — nie.`
      : `Skrzydło ${model.name}: „${correctLabel}” — TAK, pozostałe wymienione — NIE.`,
    imagePath: model.photoOriginalPath,
    // próbka POPRAWNEGO dekoru zdradzałaby odpowiedź — tu tylko zdjęcie modelu
    swatchPath: null,
  };
}

function genFeature(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
  opts?: GenerateOptions,
): GeneratedQuestion | null {
  const modelById = new Map(snapshot.models.map((m) => [m.id, m]));
  const featureById = new Map<string, FeatureData>();
  const kindById = new Map<string, FeatureKind>();
  for (const f of snapshot.features) {
    const kind = featureKind(f.category);
    if (kind === null) continue; // np. grupa „wycofane” — poza pulą pytań
    featureById.set(f.id, f);
    kindById.set(f.id, kind);
  }

  let cells = snapshot.matrix.filter(
    (c) =>
      !cellUsed(state, c.modelId, c.featureId) &&
      modelById.has(c.modelId) &&
      featureById.has(c.featureId),
  );
  if (cells.length === 0) return null;

  // Rodzaj cechy: jawny filtr (kategorie nauki) albo losowanie 50/50 —
  // dekorów jest ~4× więcej niż cech technicznych i bez wyrównania
  // zalewają pulę pytań mieszanych.
  let kind = opts?.featureKind ?? null;
  if (!kind) {
    const hasTechnical = cells.some((c) => kindById.get(c.featureId) === "technical");
    const hasDekor = cells.some((c) => kindById.get(c.featureId) === "dekor");
    if (hasTechnical && hasDekor) kind = chance(rng, 0.5) ? "technical" : "dekor";
    else kind = hasTechnical ? "technical" : "dekor";
  }
  cells = cells.filter((c) => kindById.get(c.featureId) === kind);
  if (cells.length === 0) return null;

  // Wariant pytania 50/50: „która cecha?” (ABCD) albo TAK/NIE.
  // ABCD bywa niewykonalny (model bez 3 cech z jawnym NIE) → fallback niżej.
  if (chance(rng, 0.5)) {
    const pick4 = genFeaturePick(
      snapshot, state, rng, cells, kind, modelById, featureById, kindById,
    );
    if (pick4) return pick4;
  }

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

  const verdict = cell.hasFeature ? "TAK" : "NIE";
  const isDekor = kind === "dekor";
  const dekorName = featureDisplayName(feature);
  const group = feature.category?.trim();

  // Technika: indywidualna składnia per kolumna Excela (feature-copy.ts);
  // nazwy nieznane (przyszłe kolumny) dostają gramatycznie bezpieczny fallback.
  const copy = isDekor ? null : technicalCopy(feature.name);
  const prompt = isDekor
    ? `Czy model ${model.name} występuje w dekorze „${dekorName}”?`
    : (copy?.question.replace("{model}", model.name) ??
      `Czy skrzydło ${model.name} ma cechę „${feature.name}”?`);
  const explanation = isDekor
    ? `Dekor „${dekorName}”${group ? ` (${group})` : ""} w modelu ${model.name}: ${verdict}.`
    : `„${copy?.label ?? feature.name}” — ${model.name}: ${verdict}.`;

  return {
    qtype: "feature_yn",
    dedupeKey: `f:${cell.modelId}:${cell.featureId}`,
    payload: {
      qtype: "feature_yn",
      prompt,
      options: ["TAK", "NIE"],
    },
    correctAnswer: { value: verdict },
    explanation,
    imagePath: model.photoOriginalPath,
    swatchPath: isDekor ? feature.imagePath : null,
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
    swatchPath: null,
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
  // Dystraktory: losowe modele SPOZA rodziny celu. Warianty z jednej
  // kolekcji („ARTE 10" vs „ARTE B 10") są nie do odróżnienia po zdjęciu
  // i frustrują — ta sama kolekcja wchodzi tylko, gdy brakuje innych.
  const others = snapshot.models.filter((m) => m.name !== target.name);
  const otherFamilies = others.filter(
    (m) => m.collection === null || m.collection !== target.collection,
  );
  const sameFamily = others.filter((m) => !otherFamilies.includes(m));

  const distractorNames: string[] = [];
  for (const m of [...shuffle(rng, otherFamilies), ...shuffle(rng, sameFamily)]) {
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
    swatchPath: null,
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
    swatchPath: null,
  };
}

const GENERATORS: Record<
  QType,
  (
    s: CatalogSnapshot,
    st: GenState,
    r: Rng,
    o?: GenerateOptions,
  ) => GeneratedQuestion | null
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
  opts?: GenerateOptions,
): GeneratedQuestion | null {
  return GENERATORS[qtype](snapshot, state, rng, opts);
}

/* ------------------------------------------------------------------ */
/* Kompozycja sesji                                                    */
/* ------------------------------------------------------------------ */

/** Zawężenie cech dla kategorii nauki (technika vs dekory). */
function categoryOptions(category: Category): GenerateOptions | undefined {
  if (category === "technical") return { featureKind: "technical" };
  if (category === "dekory") return { featureKind: "dekor" };
  return undefined;
}

/** Jednostka losowania: kategoria → typ pytania + zawężenie + pula + waga. */
interface MixUnit {
  category: Exclude<Category, "mix">;
  qtype: QType;
  opts: GenerateOptions | undefined;
  available: number;
  weight: number;
}

/**
 * Jednostki do losowania: kategorie z niepustą pulą, z wagami z globalnych
 * proporcji (app_settings.question_mix — panel admina). Waga 0 wyklucza
 * kategorię; gdy wszystkie wybrane mają 0 (albo brak wag), wagi są równe,
 * żeby wybór użytkownika w trybie nauki zawsze coś dał.
 */
function buildUnits(
  snapshot: CatalogSnapshot,
  categories: readonly Category[],
  mix: QuestionMix,
): MixUnit[] {
  const all = Object.keys(CATEGORY_TO_QTYPE) as Exclude<Category, "mix">[];
  const picked =
    categories.length === 0 || categories.includes("mix")
      ? all
      : all.filter((c) => categories.includes(c));

  const kinds = featureKindAvailability(snapshot);
  const types = typeAvailability(snapshot);
  const units = picked
    .map((c) => ({
      category: c,
      qtype: CATEGORY_TO_QTYPE[c],
      opts: categoryOptions(c),
      available:
        c === "technical"
          ? kinds.technical
          : c === "dekory"
            ? kinds.dekor
            : types[CATEGORY_TO_QTYPE[c]],
      weight: Math.max(0, mix[c] ?? 0),
    }))
    .filter((u) => u.available > 0);

  const withWeight = units.filter((u) => u.weight > 0);
  if (withWeight.length > 0) return withWeight;
  return units.map((u) => ({ ...u, weight: 1 }));
}

/**
 * Podział `wanted` pytań między jednostki proporcjonalnie do wag
 * (metoda największych reszt), przycięty pojemnością puli; nadwyżka
 * z przyciętych jednostek wraca do tych, które mają jeszcze zapas.
 */
function allocateSlots(units: MixUnit[], wanted: number): Map<MixUnit, number> {
  const totalWeight = units.reduce((n, u) => n + u.weight, 0);
  const slots = new Map<MixUnit, number>();
  if (totalWeight === 0 || wanted <= 0) return slots;

  const exact = units.map((u) => ({ u, ideal: (wanted * u.weight) / totalWeight }));
  for (const { u, ideal } of exact) {
    slots.set(u, Math.min(u.available, Math.floor(ideal)));
  }

  // Reszty: kolejność wg części dziesiętnej (największa reszta pierwsza).
  const rest = [...exact].sort(
    (a, b) => (b.ideal % 1) - (a.ideal % 1) || b.u.weight - a.u.weight,
  );
  let assigned = [...slots.values()].reduce((n, v) => n + v, 0);
  for (const { u } of rest) {
    if (assigned >= wanted) break;
    if ((slots.get(u) ?? 0) < u.available) {
      slots.set(u, (slots.get(u) ?? 0) + 1);
      assigned += 1;
    }
  }
  // Redystrybucja nadwyżki po przycięciu pojemnością.
  while (assigned < wanted) {
    const room = units.filter((u) => (slots.get(u) ?? 0) < u.available);
    if (room.length === 0) break;
    for (const u of room) {
      if (assigned >= wanted) break;
      slots.set(u, (slots.get(u) ?? 0) + 1);
      assigned += 1;
    }
  }
  return slots;
}

/**
 * Sesja trybu nauki: 20 pytań z WYBRANYCH kategorii (jedna, kilka lub
 * wszystkie), rozdzielonych zgodnie z globalnymi proporcjami i przetasowanych.
 * Pusta lista albo „mix” = wszystkie kategorie. Mniejsze pule → mniej pytań.
 */
export function composeLearningSession(
  snapshot: CatalogSnapshot,
  categories: readonly Category[],
  state: GenState,
  rng: Rng,
  mix: QuestionMix = DEFAULT_QUESTION_MIX,
): GeneratedQuestion[] {
  const units = buildUnits(snapshot, categories, mix);
  if (units.length === 0) return [];

  const wanted = Math.min(
    LEARNING_SESSION_SIZE,
    units.reduce((n, u) => n + u.available, 0),
  );
  const slots = allocateSlots(units, wanted);

  const plan = shuffle(
    rng,
    units.flatMap((u) => Array<MixUnit>(slots.get(u) ?? 0).fill(u)),
  );

  const out: GeneratedQuestion[] = [];
  for (const u of plan) {
    const q = generateQuestion(u.qtype, snapshot, state, rng, u.opts);
    if (q) out.push(q);
  }
  // Dopełnienie — plan mógł trafić w wyczerpane pule (kolejność wg wag).
  const byWeight = [...units].sort((a, b) => b.weight - a.weight);
  let stalled = false;
  while (out.length < wanted && !stalled) {
    stalled = true;
    for (const u of byWeight) {
      if (out.length >= wanted) break;
      const q = generateQuestion(u.qtype, snapshot, state, rng, u.opts);
      if (q) {
        out.push(q);
        stalled = false;
      }
    }
  }
  return out;
}

/**
 * Partia pytań wyzwania (mix, długość nieograniczona) — typ każdego pytania
 * losowany zgodnie z globalnymi proporcjami. Po wyczerpaniu puli dedupe jest
 * zerowane: bardzo długie runy mogą zobaczyć pytanie ponownie, ale gra się
 * nie kończy z braku pytań.
 */
export function composeChallengeBatch(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
  count = CHALLENGE_BATCH_SIZE,
  mix: QuestionMix = DEFAULT_QUESTION_MIX,
): GeneratedQuestion[] {
  const units = buildUnits(snapshot, ["mix"], mix);
  if (units.length === 0) return [];

  const out: GeneratedQuestion[] = [];
  let exhaustionResets = 0;
  while (out.length < count) {
    const first = weightedPick(rng, units, (u) => u.weight);
    // Wylosowana kategoria najpierw; gdy jej pula wyczerpana — pozostałe.
    const order = [first, ...shuffle(rng, units).filter((u) => u !== first)];
    let generated: GeneratedQuestion | null = null;
    for (const u of order) {
      generated = generateQuestion(u.qtype, snapshot, state, rng, u.opts);
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

/** Zestaw Quizu Dnia: 10 pytań wg globalnych proporcji (deterministycznie). */
export function composeDailyQuiz(
  snapshot: CatalogSnapshot,
  state: GenState,
  rng: Rng,
  mix: QuestionMix = DEFAULT_QUESTION_MIX,
): GeneratedQuestion[] {
  const units = buildUnits(snapshot, ["mix"], mix);
  if (units.length === 0) return [];

  const wanted = Math.min(
    DAILY_QUIZ_SIZE,
    units.reduce((n, u) => n + u.available, 0),
  );
  const slots = allocateSlots(units, wanted);
  const plan = shuffle(
    rng,
    units.flatMap((u) => Array<MixUnit>(slots.get(u) ?? 0).fill(u)),
  );

  const out: GeneratedQuestion[] = [];
  for (const u of plan) {
    const q = generateQuestion(u.qtype, snapshot, state, rng, u.opts);
    if (q) out.push(q);
  }
  // Dopełnienie braków dowolną kategorią z zapasem.
  let stalled = false;
  while (out.length < wanted && !stalled) {
    stalled = true;
    for (const u of units) {
      if (out.length >= wanted) break;
      const q = generateQuestion(u.qtype, snapshot, state, rng, u.opts);
      if (q) {
        out.push(q);
        stalled = false;
      }
    }
  }
  return out;
}
