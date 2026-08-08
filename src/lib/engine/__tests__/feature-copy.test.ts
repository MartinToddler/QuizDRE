import { describe, expect, it } from "vitest";
import { foldName, technicalCopy } from "../feature-copy";
import { generateQuestion, newGenState } from "../generators";
import { mulberry32 } from "../rng";
import type { CatalogSnapshot } from "../types";
import { makeSnapshot } from "./fixtures";

describe("foldName", () => {
  it("ujednolica wielkość liter, spacje i diakrytyki", () => {
    expect(foldName("  Krawędź   BEZPRZYLGOWA ")).toBe("krawedz bezprzylgowa");
    expect(foldName("wysokość 211 cm")).toBe("wysokosc 211 cm");
  });
});

describe("technicalCopy", () => {
  it("znajduje szablon niezależnie od wielkości liter i diakrytyków", () => {
    expect(technicalCopy("Krawędź bezprzylgowa")?.question).toContain(
      "wersji bezprzylgowej",
    );
    expect(technicalCopy("IZOLACJA AKUSTYCZNA RW=37DB")?.label).toBe(
      "izolacja akustyczna Rw = 37 dB",
    );
  });

  it("zwraca null dla nieznanej cechy", () => {
    expect(technicalCopy("Cecha zupełnie nowa")).toBeNull();
  });
});

/** Snapshot z jedną cechą techniczną o zadanej nazwie. */
function snapshotWithFeature(name: string): CatalogSnapshot {
  const snap = makeSnapshot();
  snap.features = [
    { id: "f-x", name, category: "dodatkowe informacje", imagePath: null },
  ];
  snap.matrix = snap.models.map((m) => ({
    modelId: m.id,
    featureId: "f-x",
    hasFeature: true,
  }));
  return snap;
}

describe("pytania techniczne w generatorze", () => {
  it("zmapowana kolumna dostaje indywidualną składnię", () => {
    const snap = snapshotWithFeature("izolacja akustyczna Rw=37dB");
    const q = generateQuestion("feature_yn", snap, newGenState(), mulberry32(1))!;
    expect(q.payload.prompt).toMatch(
      /^Czy skrzydło .+ oferuje izolację akustyczną na poziomie Rw = 37 dB\?$/,
    );
    expect(q.explanation).toContain("izolacja akustyczna Rw = 37 dB");
    expect(q.payload.prompt).not.toContain("Rw=37dB");
  });

  it("niezmapowana kolumna dostaje bezpieczny fallback", () => {
    const snap = snapshotWithFeature("Cecha przyszłościowa XYZ");
    const q = generateQuestion("feature_yn", snap, newGenState(), mulberry32(2))!;
    expect(q.payload.prompt).toMatch(
      /^Czy skrzydło .+ ma cechę „Cecha przyszłościowa XYZ”\?$/,
    );
  });
});
