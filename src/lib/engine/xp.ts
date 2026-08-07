/**
 * Formuły XP i rangi.
 *
 * UWAGA: obliczanie XP w trakcie gry dzieje się autorytatywnie w SQL
 * (supabase/migrations — submit_answer/finish_session) i MUSI być zgodne
 * z tym plikiem. TS służy do wyświetlania (rangi, postęp) i testów.
 */

export const XP_BASE_ANSWER = 10;
export const XP_BASE_ANSWER_DAILY = 15;
export const XP_SESSION_LEARNING_DONE = 20;
export const XP_SESSION_PERFECT = 30;
export const XP_CHALLENGE_MILESTONE = 15; // co 10 poprawnych w wyzwaniu
export const XP_DAILY_QUIZ_DONE = 25;
export const XP_DAILY_SOFTCAP = 500; // powyżej: połowa stawki (anty-grind)
export const MIN_ANSWERS_FOR_ACTIVE_DAY = 5;

export function speedBonus(timeMs: number): number {
  if (timeMs < 1000) return 0; // podejrzanie szybko — bez bonusu
  if (timeMs <= 5000) return 5;
  if (timeMs <= 10000) return 3;
  if (timeMs <= 20000) return 1;
  return 0;
}

/** Bonus za combo PO zaliczeniu odpowiedzi (2. z rzędu = +1 … cap +10). */
export function comboBonus(comboAfter: number): number {
  return Math.max(0, Math.min(comboAfter - 1, 10));
}

export function answerXp(opts: {
  base: number;
  timeMs: number;
  comboAfter: number;
  xpTodayFromAnswers: number;
}): number {
  const raw = opts.base + speedBonus(opts.timeMs) + comboBonus(opts.comboAfter);
  return opts.xpTodayFromAnswers > XP_DAILY_SOFTCAP ? Math.ceil(raw / 2) : raw;
}

/* ------------------------------------------------------------------ */
/* Rangi                                                               */
/* ------------------------------------------------------------------ */

export interface Rank {
  threshold: number;
  name: string;
}

/** Nazwy robocze — do akceptacji przez DRE. */
export const RANKS: readonly Rank[] = [
  { threshold: 0, name: "Świeżak" },
  { threshold: 150, name: "Praktykant Klamki" },
  { threshold: 400, name: "Czeladnik Zawiasów" },
  { threshold: 800, name: "Specjalista od Ościeżnic" },
  { threshold: 1500, name: "Doradca z Przytupem" },
  { threshold: 2500, name: "Starszy Doradca" },
  { threshold: 4000, name: "Ekspert DRE" },
  { threshold: 6500, name: "Mistrz Otwarć" },
  { threshold: 10000, name: "Wielki Mistrz" },
  { threshold: 15000, name: "Legenda DRE" },
] as const;

export interface RankInfo {
  index: number;
  name: string;
  threshold: number;
  next: Rank | null;
  /** Postęp do następnej rangi w [0, 1]; 1 dla ostatniej. */
  progress: number;
}

export function rankForXp(xp: number): RankInfo {
  let index = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].threshold) {
      index = i;
      break;
    }
  }
  const current = RANKS[index];
  const next = index + 1 < RANKS.length ? RANKS[index + 1] : null;
  const progress = next
    ? (xp - current.threshold) / (next.threshold - current.threshold)
    : 1;
  return {
    index,
    name: current.name,
    threshold: current.threshold,
    next,
    progress: Math.min(1, Math.max(0, progress)),
  };
}
