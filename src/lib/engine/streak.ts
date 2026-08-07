/**
 * Logika streaka — TS-owe lustro implementacji SQL (finish_session).
 * Autorytatywna wersja działa w bazie; ta służy do UI i testów.
 * Wszystkie daty to stringi ISO (YYYY-MM-DD) w strefie Europe/Warsaw.
 */

export const FREEZE_EVERY_STREAK_DAYS = 7;
export const MAX_FREEZES = 2;

export interface StreakState {
  current: number;
  longest: number;
  freezes: number;
  lastActiveDate: string | null;
}

export interface StreakResult extends StreakState {
  usedFreeze: boolean;
  earnedFreeze: boolean;
  /** Czy to pierwszy aktywny dzień dzisiaj (należy się dzienny bonus XP). */
  firstActivityToday: boolean;
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

export function applyActivity(state: StreakState, today: string): StreakResult {
  const base: StreakResult = {
    ...state,
    usedFreeze: false,
    earnedFreeze: false,
    firstActivityToday: false,
  };

  if (state.lastActiveDate === today) return base; // już zaliczone dziś

  let current: number;
  let freezes = state.freezes;
  let usedFreeze = false;

  if (state.lastActiveDate === null) {
    current = 1;
  } else {
    const gap = daysBetween(state.lastActiveDate, today);
    if (gap === 1) {
      current = state.current + 1;
    } else if (gap === 2 && freezes > 0) {
      freezes -= 1;
      usedFreeze = true;
      current = state.current + 1;
    } else {
      current = 1;
    }
  }

  let earnedFreeze = false;
  if (current > 0 && current % FREEZE_EVERY_STREAK_DAYS === 0 && freezes < MAX_FREEZES) {
    freezes += 1;
    earnedFreeze = true;
  }

  return {
    current,
    longest: Math.max(state.longest, current),
    freezes,
    lastActiveDate: today,
    usedFreeze,
    earnedFreeze,
    firstActivityToday: true,
  };
}

/** Dzienny bonus XP za utrzymanie serii: +5 × min(streak, 10). */
export function streakDailyBonus(streak: number): number {
  return 5 * Math.min(streak, 10);
}
