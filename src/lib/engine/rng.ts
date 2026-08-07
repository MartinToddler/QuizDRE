/**
 * Seedowany PRNG (mulberry32) — deterministyczne testy generatorów
 * i powtarzalna generacja Quizu Dnia.
 */
export interface Rng {
  /** Liczba z przedziału [0, 1). */
  next(): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Seed z dowolnego stringa (fnv-1a) — np. z daty dla Quizu Dnia. */
export function seedFromString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomRng(): Rng {
  return mulberry32(Math.floor(Math.random() * 0xffffffff));
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng.next() * maxExclusive);
}

export function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[randInt(rng, arr.length)];
}

/** Fisher–Yates, zwraca NOWĄ tablicę. */
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Losowanie ważone — wagi nieujemne, przynajmniej jedna dodatnia. */
export function weightedPick<T>(
  rng: Rng,
  items: readonly T[],
  weightOf: (item: T) => number,
): T {
  let total = 0;
  for (const it of items) total += weightOf(it);
  if (total <= 0) return pick(rng, items);
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= weightOf(it);
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}
