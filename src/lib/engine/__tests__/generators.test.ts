import { describe, expect, it } from "vitest";
import {
  CHALLENGE_BATCH_SIZE,
  composeChallengeBatch,
  composeDailyQuiz,
  composeLearningSession,
  generateQuestion,
  newGenState,
  typeAvailability,
} from "../generators";
import { mulberry32 } from "../rng";
import { flipOrientation } from "../types";
import { makeSnapshot } from "./fixtures";

describe("dostępność typów", () => {
  it("liczy pule dla wszystkich typów", () => {
    const snap = makeSnapshot();
    const avail = typeAvailability(snap);
    expect(avail.feature_yn).toBe(120);
    expect(avail.left_right).toBe(12);
    expect(avail.model_guess).toBe(12);
    expect(avail.theory).toBe(30);
  });

  it("model_guess wymaga min. 4 modeli", () => {
    const snap = makeSnapshot();
    snap.models = snap.models.slice(0, 3);
    expect(typeAvailability(snap).model_guess).toBe(0);
  });
});

describe("typ 1: cecha TAK/NIE", () => {
  it("balansuje odpowiedzi ~50/50 w wielu sesjach", () => {
    const snap = makeSnapshot();
    let yes = 0;
    let total = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rng = mulberry32(seed);
      const state = newGenState();
      const session = composeLearningSession(snap, "technical", state, rng);
      for (const q of session) {
        total += 1;
        if ("value" in q.correctAnswer && q.correctAnswer.value === "TAK") yes += 1;
      }
    }
    const share = yes / total;
    expect(total).toBe(50 * 20);
    expect(share).toBeGreaterThan(0.42);
    expect(share).toBeLessThan(0.58);
  });

  it("nie powtarza pary (model, cecha) w sesji", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(
      snap,
      "technical",
      newGenState(),
      mulberry32(7),
    );
    const keys = session.map((q) => q.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("typ 2: prawe/lewe", () => {
  it("poprawna odpowiedź odpowiada wyświetlanej orientacji", () => {
    const snap = makeSnapshot();
    const byPath = new Map(
      snap.models.flatMap((m) => [
        [m.photoOriginalPath!, { m, mirrored: false }] as const,
        [m.photoMirroredPath!, { m, mirrored: true }] as const,
      ]),
    );
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGenState();
      const rng = mulberry32(seed);
      for (let i = 0; i < 12; i++) {
        const q = generateQuestion("left_right", snap, state, rng);
        if (!q) break;
        const src = byPath.get(q.imagePath!)!;
        const displayed = src.mirrored
          ? flipOrientation(src.m.originalOrientation)
          : src.m.originalOrientation;
        const expected = displayed === "left" ? "LEWE" : "PRAWE";
        expect(q.correctAnswer).toEqual({ value: expected });
      }
    }
  });

  it("ten sam model nie wraca w jednej sesji", () => {
    const snap = makeSnapshot();
    const state = newGenState();
    const rng = mulberry32(3);
    const keys: string[] = [];
    for (let i = 0; i < 12; i++) {
      const q = generateQuestion("left_right", snap, state, rng);
      expect(q).not.toBeNull();
      keys.push(q!.dedupeKey);
    }
    expect(new Set(keys).size).toBe(12);
    expect(generateQuestion("left_right", snap, state, rng)).toBeNull();
  });
});

describe("typ 3: jaki to model", () => {
  it("4 unikatowe opcje, poprawna pod wskazanym indeksem", () => {
    const snap = makeSnapshot();
    const state = newGenState();
    const rng = mulberry32(11);
    const q = generateQuestion("model_guess", snap, state, rng)!;
    expect(q.payload.options).toHaveLength(4);
    expect(new Set(q.payload.options).size).toBe(4);
    const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
    const targetName = q.payload.options[idx];
    expect(snap.models.some((m) => m.name === targetName)).toBe(true);
  });

  it("dystraktory preferują tę samą kolekcję", () => {
    const snap = makeSnapshot();
    // Każda kolekcja ma 4 modele → zawsze 3 dystraktory z tej samej kolekcji.
    for (let seed = 1; seed <= 15; seed++) {
      const q = generateQuestion(
        "model_guess",
        snap,
        newGenState(),
        mulberry32(seed),
      )!;
      const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
      const target = snap.models.find((m) => m.name === q.payload.options[idx])!;
      const collections = q.payload.options.map(
        (name) => snap.models.find((m) => m.name === name)!.collection,
      );
      expect(collections.every((c) => c === target.collection)).toBe(true);
    }
  });

  it("balansuje litery A–D (żadna nie dominuje)", () => {
    const snap = makeSnapshot();
    const state = newGenState();
    const rng = mulberry32(5);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 12; i++) {
      const q = generateQuestion("model_guess", snap, state, rng)!;
      const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
      counts[idx] += 1;
    }
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("typ 4: teoria", () => {
  it("tasuje odpowiedzi zachowując poprawną", () => {
    const snap = makeSnapshot();
    const q = generateQuestion("theory", snap, newGenState(), mulberry32(2))!;
    const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
    const original = snap.theory.find((t) => t.question === q.payload.prompt)!;
    expect(q.payload.options[idx]).toBe(original.answers[original.correctIndex]);
    expect(new Set(q.payload.options).size).toBe(q.payload.options.length);
  });

  it("omija pytania z ostatnich sesji, dopóki są inne", () => {
    const snap = makeSnapshot();
    const recent = new Set(snap.theory.slice(0, 25).map((t) => t.id));
    const state = newGenState({ recentTheoryIds: recent });
    const rng = mulberry32(9);
    for (let i = 0; i < 5; i++) {
      const q = generateQuestion("theory", snap, state, rng)!;
      const original = snap.theory.find((t) => t.question === q.payload.prompt)!;
      expect(recent.has(original.id)).toBe(false);
    }
  });
});

describe("kompozycja sesji", () => {
  it("nauka mix daje 20 pytań bez powtórek", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(snap, "mix", newGenState(), mulberry32(4));
    expect(session).toHaveLength(20);
    expect(new Set(session.map((q) => q.dedupeKey)).size).toBe(20);
  });

  it("nauka w kategorii z małą pulą zwraca tyle, ile się da", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(
      snap,
      "left_right",
      newGenState(),
      mulberry32(6),
    );
    expect(session).toHaveLength(12); // tylko 12 modeli
  });

  it("wyzwanie dogrywa partie nawet po wyczerpaniu puli", () => {
    const snap = makeSnapshot();
    const state = newGenState();
    const rng = mulberry32(8);
    const total: string[] = [];
    for (let batch = 0; batch < 30; batch++) {
      const qs = composeChallengeBatch(snap, state, rng);
      expect(qs).toHaveLength(CHALLENGE_BATCH_SIZE);
      total.push(...qs.map((q) => q.dedupeKey));
    }
    expect(total).toHaveLength(300); // pula ~174 → reset dedupe zadziałał
  });

  it("Quiz Dnia: 10 pytań wg szablonu i deterministyczny przy tym samym seedzie", () => {
    const snap = makeSnapshot();
    const a = composeDailyQuiz(snap, newGenState(), mulberry32(20260807));
    const b = composeDailyQuiz(snap, newGenState(), mulberry32(20260807));
    expect(a).toHaveLength(10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const byType = a.reduce<Record<string, number>>((acc, q) => {
      acc[q.qtype] = (acc[q.qtype] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType.theory).toBe(3);
    expect(byType.feature_yn).toBe(3);
    expect(byType.model_guess).toBe(2);
    expect(byType.left_right).toBe(2);
  });
});
