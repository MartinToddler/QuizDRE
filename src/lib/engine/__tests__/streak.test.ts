import { describe, expect, it } from "vitest";
import { applyActivity, streakDailyBonus, type StreakState } from "../streak";

const base: StreakState = {
  current: 5,
  longest: 8,
  freezes: 1,
  lastActiveDate: "2026-08-06",
};

describe("streak", () => {
  it("pierwszy dzień w ogóle → 1", () => {
    const r = applyActivity(
      { current: 0, longest: 0, freezes: 0, lastActiveDate: null },
      "2026-08-07",
    );
    expect(r.current).toBe(1);
    expect(r.firstActivityToday).toBe(true);
  });

  it("druga sesja tego samego dnia → bez zmian", () => {
    const r = applyActivity({ ...base, lastActiveDate: "2026-08-07" }, "2026-08-07");
    expect(r.current).toBe(5);
    expect(r.firstActivityToday).toBe(false);
  });

  it("dzień po dniu → +1", () => {
    const r = applyActivity(base, "2026-08-07");
    expect(r.current).toBe(6);
    expect(r.usedFreeze).toBe(false);
  });

  it("jeden dzień przerwy + freeze → seria uratowana", () => {
    const r = applyActivity(base, "2026-08-08");
    expect(r.current).toBe(6);
    expect(r.usedFreeze).toBe(true);
    expect(r.freezes).toBe(0);
  });

  it("jeden dzień przerwy bez freeze → reset", () => {
    const r = applyActivity({ ...base, freezes: 0 }, "2026-08-08");
    expect(r.current).toBe(1);
  });

  it("dłuższa przerwa → reset mimo freeze", () => {
    const r = applyActivity(base, "2026-08-10");
    expect(r.current).toBe(1);
    expect(r.freezes).toBe(1); // freeze nieskonsumowany
  });

  it("co 7 dni serii przybywa freeze (max 2)", () => {
    const r = applyActivity({ ...base, current: 6, freezes: 0 }, "2026-08-07");
    expect(r.current).toBe(7);
    expect(r.earnedFreeze).toBe(true);
    expect(r.freezes).toBe(1);

    const r2 = applyActivity(
      { current: 13, longest: 13, freezes: 2, lastActiveDate: "2026-08-06" },
      "2026-08-07",
    );
    expect(r2.current).toBe(14);
    expect(r2.earnedFreeze).toBe(false); // cap 2
    expect(r2.freezes).toBe(2);
  });

  it("longest podąża za current", () => {
    const r = applyActivity({ ...base, current: 8 }, "2026-08-07");
    expect(r.longest).toBe(9);
  });
});

describe("streakDailyBonus", () => {
  it("+5 XP × min(streak, 10)", () => {
    expect(streakDailyBonus(1)).toBe(5);
    expect(streakDailyBonus(10)).toBe(50);
    expect(streakDailyBonus(30)).toBe(50);
  });
});
