import { describe, expect, it } from "vitest";
import {
  CHALLENGE_BATCH_SIZE,
  composeChallengeBatch,
  composeDailyQuiz,
  composeLearningSession,
  featureKindAvailability,
  generateQuestion,
  newGenState,
  typeAvailability,
} from "../generators";
import { mulberry32 } from "../rng";
import { featureKind, flipOrientation } from "../types";
import { makeSnapshot } from "./fixtures";

describe("dostępność typów", () => {
  it("liczy pule dla wszystkich typów", () => {
    const snap = makeSnapshot();
    const avail = typeAvailability(snap);
    // 12 modeli × (5 technicznych + 4 dekory); wycofana cecha poza pulą
    expect(avail.feature_yn).toBe(108);
    expect(avail.left_right).toBe(12);
    expect(avail.model_guess).toBe(12);
    expect(avail.theory).toBe(30);
  });

  it("rozdziela pulę cech na technikę i dekory", () => {
    const snap = makeSnapshot();
    expect(featureKindAvailability(snap)).toEqual({ technical: 60, dekor: 48 });
  });

  it("model_guess wymaga min. 4 modeli", () => {
    const snap = makeSnapshot();
    snap.models = snap.models.slice(0, 3);
    expect(typeAvailability(snap).model_guess).toBe(0);
  });
});

describe("typ 1: cecha TAK/NIE", () => {
  it("balansuje odpowiedzi ~50/50 w wielu sesjach (wariant TAK/NIE)", () => {
    const snap = makeSnapshot();
    let yes = 0;
    let total = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const rng = mulberry32(seed);
      const state = newGenState();
      const session = composeLearningSession(snap, ["technical"], state, rng);
      for (const q of session) {
        if (q.payload.options.length !== 2) continue; // ABCD poza balansem TAK/NIE
        total += 1;
        if ("value" in q.correctAnswer && q.correctAnswer.value === "TAK") yes += 1;
      }
    }
    const share = yes / total;
    expect(total).toBeGreaterThan(250);
    expect(share).toBeGreaterThan(0.42);
    expect(share).toBeLessThan(0.58);
  });

  it("nie powtarza pary (model, cecha) w sesji", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(
      snap,
      ["technical"],
      newGenState(),
      mulberry32(7),
    );
    const keys = session.map((q) => q.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("podział technika / dekory", () => {
  const TECH_IDS = new Set(["feat-1", "feat-2", "feat-3", "feat-4", "feat-5"]);
  const featId = (dedupeKey: string) => dedupeKey.split(":")[2];

  it("featureKind klasyfikuje grupy z arkusza", () => {
    expect(featureKind("dodatkowe informacje")).toBe("technical");
    expect(featureKind(null)).toBe("technical"); // dane seedowe bez kategorii
    expect(featureKind("CPL")).toBe("dekor");
    expect(featureKind("lakierowane LUX")).toBe("dekor");
    expect(featureKind("wycofane")).toBeNull();
    expect(featureKind(" WYCOFANE ")).toBeNull();
  });

  it("kategoria „technical” pyta wyłącznie o cechy techniczne", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(snap, ["technical"], newGenState(), mulberry32(13));
    expect(session).toHaveLength(20);
    for (const q of session) {
      expect(TECH_IDS.has(featId(q.dedupeKey))).toBe(true);
      expect(q.payload.prompt).not.toContain("dekorze");
    }
  });

  it("kategoria „dekory” pyta wyłącznie o dekory, ze zdjęciem modelu i próbką", () => {
    const snap = makeSnapshot();
    const modelById = new Map(snap.models.map((m) => [m.id, m]));
    const featureById = new Map(snap.features.map((f) => [f.id, f]));
    const session = composeLearningSession(snap, ["dekory"], newGenState(), mulberry32(14));
    expect(session).toHaveLength(20);
    for (const q of session) {
      const [, modelId, fid] = q.dedupeKey.split(":");
      expect(TECH_IDS.has(fid)).toBe(false);
      expect(q.payload.prompt).toMatch(/dekor(ze|ów)/);
      expect(q.imagePath).toBe(modelById.get(modelId)!.photoOriginalPath);
      if (q.payload.options.length === 2) {
        expect(q.swatchPath).toBe(featureById.get(fid)!.imagePath);
      } else {
        // ABCD: próbka poprawnego dekoru zdradzałaby odpowiedź
        expect(q.swatchPath).toBeNull();
      }
    }
  });

  it("prompt dekoru bez sufiksu grupy; grupa w wyjaśnieniu", () => {
    const snap = makeSnapshot();
    // zawęź macierz do cechy „Orzech (CPL)” — pytanie musi paść o nią
    snap.matrix = snap.matrix.filter((c) => c.featureId === "feat-6");
    const q = generateQuestion("feature_yn", snap, newGenState(), mulberry32(1))!;
    expect(q.payload.prompt).toContain("„Orzech”");
    expect(q.payload.prompt).not.toContain("Orzech (CPL)");
    expect(q.explanation).toContain("(CPL)");
  });

  it("cechy wycofane nigdy nie wypadają", () => {
    const snap = makeSnapshot();
    for (let seed = 1; seed <= 10; seed++) {
      const state = newGenState();
      const rng = mulberry32(seed);
      for (;;) {
        const q = generateQuestion("feature_yn", snap, state, rng);
        if (!q) break;
        expect(featId(q.dedupeKey)).not.toBe("feat-10");
      }
    }
  });

  it("oba warianty (TAK/NIE i ABCD) pojawiają się; fakt (model, cecha) nie wraca w żadnym", () => {
    // 1 cecha na TAK + 4 z jawnym NIE per model — ABCD zawsze wykonalne.
    const snap = makeSnapshot();
    snap.features = [
      { id: "af-0", name: "wysokość 211 cm", category: "dodatkowe informacje", imagePath: null },
      { id: "af-1", name: "EI30", category: "dodatkowe informacje", imagePath: null },
      { id: "af-2", name: "Szyba", category: "dodatkowe informacje", imagePath: null },
      { id: "af-3", name: "Intarsja", category: "dodatkowe informacje", imagePath: null },
      { id: "af-4", name: "Wstawka", category: "dodatkowe informacje", imagePath: null },
    ];
    snap.matrix = snap.models.flatMap((m) =>
      snap.features.map((f) => ({
        modelId: m.id,
        featureId: f.id,
        hasFeature: f.id === "af-0",
      })),
    );

    const counts = { yn: 0, abcd: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGenState();
      const rng = mulberry32(seed);
      const facts = new Set<string>();
      for (;;) {
        const q = generateQuestion("feature_yn", snap, state, rng);
        if (!q) break;
        if (q.payload.options.length === 4) {
          counts.abcd += 1;
          expect(new Set(q.payload.options).size).toBe(4);
          const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
          expect(q.payload.options[idx]).toBe("wysokość 211 cm");
          const falseLabels = new Set([
            "odporność ogniowa EI30",
            "wersja z szybą",
            "intarsja",
            "wstawka",
          ]);
          q.payload.options
            .filter((_, i) => i !== idx)
            .forEach((w) => expect(falseLabels.has(w)).toBe(true));
          expect(q.payload.prompt).toContain("Która z poniższych cech");
          expect(q.dedupeKey.startsWith("f4:")).toBe(true);
        } else {
          counts.yn += 1;
        }
        const [, m, f] = q.dedupeKey.split(":");
        const fact = `${m}:${f}`;
        expect(facts.has(fact)).toBe(false); // twin TAK/NIE ↔ ABCD zablokowany
        facts.add(fact);
      }
    }
    expect(counts.yn).toBeGreaterThan(0);
    expect(counts.abcd).toBeGreaterThan(0);
  });

  it("ABCD dekorów: bez próbki (anty-leak), poprawna to dekor z TAK", () => {
    const snap = makeSnapshot();
    snap.features = [
      { id: "df-0", name: "Dąb złoty", category: "CPL", imagePath: "dekory/dab-zloty.jpg" },
      { id: "df-1", name: "Orzech ciemny", category: "CPL", imagePath: "dekory/orzech.jpg" },
      { id: "df-2", name: "Biel arktyczna", category: "cell", imagePath: null },
      { id: "df-3", name: "Grafit", category: "cell", imagePath: null },
      { id: "df-4", name: "Wenge", category: "CPL", imagePath: null },
    ];
    snap.matrix = snap.models.flatMap((m) =>
      snap.features.map((f) => ({
        modelId: m.id,
        featureId: f.id,
        hasFeature: f.id === "df-0",
      })),
    );

    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const q = generateQuestion("feature_yn", snap, newGenState(), mulberry32(seed));
      if (!q || q.payload.options.length !== 4) continue;
      checked += 1;
      expect(q.payload.prompt).toContain("W którym z poniższych dekorów");
      expect(q.swatchPath).toBeNull();
      expect(q.imagePath).not.toBeNull();
      const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
      expect(q.payload.options[idx]).toBe("Dąb złoty");
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("mix losuje technikę i dekory ~po połowie (mimo przewagi dekorów w macierzy)", () => {
    const snap = makeSnapshot();
    let tech = 0;
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = newGenState();
      const rng = mulberry32(seed);
      for (let i = 0; i < 6; i++) {
        const q = generateQuestion("feature_yn", snap, state, rng);
        if (!q) break;
        total += 1;
        if (TECH_IDS.has(featId(q.dedupeKey))) tech += 1;
      }
    }
    const share = tech / total;
    expect(share).toBeGreaterThan(0.38);
    expect(share).toBeLessThan(0.62);
  });
});

describe("typ 2: prawe/lewe", () => {
  it("poprawna odpowiedź odpowiada wyświetlanej orientacji", () => {
    const snap = makeSnapshot();
    const byPath = new Map<string, { m: (typeof snap.models)[number]; mirrored: boolean }>(
      snap.models.flatMap((m) => [
        [m.photoOriginalPath!, { m, mirrored: false }],
        [m.photoMirroredPath!, { m, mirrored: true }],
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

  it("dystraktory pochodzą spoza rodziny celu (feedback DRE)", () => {
    const snap = makeSnapshot();
    // 3 kolekcje × 4 modele → zawsze 8 modeli z innych rodzin do wyboru.
    for (let seed = 1; seed <= 15; seed++) {
      const q = generateQuestion(
        "model_guess",
        snap,
        newGenState(),
        mulberry32(seed),
      )!;
      const idx = "index" in q.correctAnswer ? q.correctAnswer.index : -1;
      const target = snap.models.find((m) => m.name === q.payload.options[idx])!;
      const distractors = q.payload.options.filter((_, i) => i !== idx);
      for (const name of distractors) {
        const m = snap.models.find((x) => x.name === name)!;
        expect(m.collection).not.toBe(target.collection);
      }
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
    const session = composeLearningSession(snap, ["mix"], newGenState(), mulberry32(4));
    expect(session).toHaveLength(20);
    expect(new Set(session.map((q) => q.dedupeKey)).size).toBe(20);
  });

  it("pusta lista kategorii = wszystkie (jak mix)", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(snap, [], newGenState(), mulberry32(21));
    expect(session).toHaveLength(20);
    expect(new Set(session.map((q) => q.qtype)).size).toBeGreaterThan(1);
  });

  it("wybór kilku kategorii ogranicza pytania do nich", () => {
    const snap = makeSnapshot();
    for (let seed = 1; seed <= 10; seed++) {
      const session = composeLearningSession(
        snap,
        ["models", "theory"],
        newGenState(),
        mulberry32(seed),
      );
      expect(session).toHaveLength(20);
      const types = new Set(session.map((q) => q.qtype));
      expect([...types].sort()).toEqual(["model_guess", "theory"]);
    }
  });

  it("technical + dekory: tylko feature_yn, oba rodzaje obecne", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(
      snap,
      ["technical", "dekory"],
      newGenState(),
      mulberry32(17),
    );
    expect(session).toHaveLength(20);
    expect(session.every((q) => q.qtype === "feature_yn")).toBe(true);
    const techIds = new Set(["feat-1", "feat-2", "feat-3", "feat-4", "feat-5"]);
    const kinds = new Set(
      session.map((q) => (techIds.has(q.dedupeKey.split(":")[2]) ? "t" : "d")),
    );
    expect(kinds.size).toBe(2);
  });

  it("nauka w kategorii z małą pulą zwraca tyle, ile się da", () => {
    const snap = makeSnapshot();
    const session = composeLearningSession(
      snap,
      ["left_right"],
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
    expect(total).toHaveLength(300); // pula ~162 → reset dedupe zadziałał
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
