import { describe, expect, it } from "vitest";
import { answerXp, comboBonus, rankForXp, RANKS, speedBonus } from "../xp";

describe("speedBonus", () => {
  it("progi czasowe", () => {
    expect(speedBonus(500)).toBe(0); // podejrzanie szybko
    expect(speedBonus(1000)).toBe(5);
    expect(speedBonus(5000)).toBe(5);
    expect(speedBonus(5001)).toBe(3);
    expect(speedBonus(10000)).toBe(3);
    expect(speedBonus(15000)).toBe(1);
    expect(speedBonus(20001)).toBe(0);
  });
});

describe("comboBonus", () => {
  it("rośnie od 2. z rzędu i ma cap 10", () => {
    expect(comboBonus(1)).toBe(0);
    expect(comboBonus(2)).toBe(1);
    expect(comboBonus(5)).toBe(4);
    expect(comboBonus(11)).toBe(10);
    expect(comboBonus(50)).toBe(10);
  });
});

describe("answerXp", () => {
  it("suma bazy, szybkości i combo", () => {
    expect(
      answerXp({ base: 10, timeMs: 3000, comboAfter: 3, xpTodayFromAnswers: 0 }),
    ).toBe(10 + 5 + 2);
  });

  it("soft-cap: połowa stawki po 500 XP dziennie", () => {
    expect(
      answerXp({ base: 10, timeMs: 3000, comboAfter: 1, xpTodayFromAnswers: 501 }),
    ).toBe(Math.ceil(15 / 2));
  });
});

describe("rankForXp", () => {
  it("progi rang", () => {
    expect(rankForXp(0).name).toBe("Świeżak");
    expect(rankForXp(149).name).toBe("Świeżak");
    expect(rankForXp(150).name).toBe("Praktykant Klamki");
    expect(rankForXp(15000).name).toBe("Legenda DRE");
    expect(rankForXp(999999).name).toBe("Legenda DRE");
  });

  it("postęp do następnej rangi", () => {
    const info = rankForXp(275); // między 150 a 400
    expect(info.next?.name).toBe("Czeladnik Zawiasów");
    expect(info.progress).toBeCloseTo((275 - 150) / (400 - 150));
    expect(rankForXp(RANKS[RANKS.length - 1].threshold).progress).toBe(1);
  });
});
