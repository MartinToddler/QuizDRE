import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cleanRowName,
  matchModelsToRows,
  parseCatalogXlsx,
} from "../catalog-xlsx";

const XLSX = "materialy/cechy/KATALOG specyfikacja kolekcji.xlsx";

function photoModelNames(): string[] {
  return readdirSync("materialy/zdjecia")
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map((f) => f.replace(/\.(jpg|jpeg|png|webp)$/i, "").replace(/\s+/g, " ").trim());
}

describe("parser realnego arkusza katalogu", () => {
  it("wybiera pierwszy niepusty arkusz i czyta nagłówki cech", async () => {
    const parsed = await parseCatalogXlsx(XLSX);
    expect(parsed.sheetName).toBe("2025_3"); // Arkusz1 jest pusty
    expect(parsed.features.length).toBeGreaterThan(100);
    const names = parsed.features.map((f) => f.name);
    expect(names).toContain("Krawędź bezprzylgowa");
    expect(names).toContain("Odwrotna Przylga");
  });

  it("czyta kolekcje, pomija sekcje i czyści przypisy z nazw", async () => {
    const parsed = await parseCatalogXlsx(XLSX);
    const names = parsed.rows.map((r) => r.name);
    expect(names).toContain("Ilis");
    expect(names).toContain("Vetro D2");
    expect(names).toContain("Nova"); // w pliku: „Nova  *”
    expect(names).toContain("Arte");
    expect(names).not.toContain("DRZWI RAMOWE"); // sekcja bez wartości
    expect(parsed.rows.length).toBeGreaterThan(60);
    expect(
      parsed.report.skippedEmptyRows.some((s) => s.name === "DRZWI RAMOWE"),
    ).toBe(true);
  });

  it("nazwy cech są unikatowe (kolizje między kategoriami dostają sufiks)", async () => {
    const parsed = await parseCatalogXlsx(XLSX);
    const names = parsed.features.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length); // wymóg klucza w bazie
    // Dekor „Orzech” występuje w grupach cell i CPL → dwie odrębne cechy:
    expect(names).toContain("Orzech (cell)");
    expect(names).toContain("Orzech (CPL)");
    expect(names).not.toContain("Orzech");
    expect(parsed.report.renamedFeatures).toContain("Orzech (cell)");
    // Wartości wierszy mają długość zgodną z finalną listą cech:
    for (const r of parsed.rows) expect(r.values).toHaveLength(names.length);
  });

  it("normalizuje wartości: x/x* = TAK, pusta = NIE, inne = raport", async () => {
    const parsed = await parseCatalogXlsx(XLSX);
    const yes = parsed.rows.reduce(
      (n, r) => n + r.values.filter((v) => v === true).length,
      0,
    );
    const no = parsed.rows.reduce(
      (n, r) => n + r.values.filter((v) => v === false).length,
      0,
    );
    expect(yes).toBeGreaterThan(1400);
    expect(no).toBeGreaterThan(5000); // puste komórki = jawne NIE
    expect(parsed.report.footnoteYes).toBeGreaterThan(100); // x*
    expect(parsed.report.ambiguous.length).toBeLessThan(15); // „ZN” itp.
    for (const a of parsed.report.ambiguous) {
      expect(a.value).not.toMatch(/^x\*?$/i);
    }
  });

  it("cleanRowName usuwa gwiazdki i zbędne spacje", () => {
    expect(cleanRowName("Nova  *")).toBe("Nova");
    expect(cleanRowName(" Vetro E * ")).toBe("Vetro E");
    expect(cleanRowName("Ilis")).toBe("Ilis");
  });
});

describe("dopasowanie modeli (nazwy zdjęć) do kolekcji", () => {
  it("najdłuższy prefiks wygrywa (Vetro D2 ≠ Vetro E)", () => {
    const match = matchModelsToRows(
      ["VETRO D2 20", "VETRO E 10", "ARTE B 10", "ARTE 10"],
      ["Vetro D2", "Vetro E", "Arte"],
    );
    expect(match.assignments.get("VETRO D2 20")).toBe("Vetro D2");
    expect(match.assignments.get("VETRO E 10")).toBe("Vetro E");
    expect(match.assignments.get("ARTE B 10")).toBe("Arte");
    expect(match.assignments.get("ARTE 10")).toBe("Arte");
  });

  it("obsługuje warianty nazw (części po „/”, skracanie od prawej)", () => {
    const match = matchModelsToRows(
      ["LUMIO 10", "HAMPTON 20"],
      ["Lumio DRE/OBI", "Hampton SUPREME"],
    );
    expect(match.assignments.get("LUMIO 10")).toBe("Lumio DRE/OBI");
    expect(match.assignments.get("HAMPTON 20")).toBe("Hampton SUPREME");
  });

  it("alias CITI → City SUPREME (potwierdzony przez DRE)", () => {
    const match = matchModelsToRows(
      ["CITI 1", "CITI 2", "CITY 5"],
      ["City SUPREME", "Arte"],
    );
    expect(match.assignments.get("CITI 1")).toBe("City SUPREME");
    expect(match.assignments.get("CITI 2")).toBe("City SUPREME");
    expect(match.assignments.get("CITY 5")).toBe("City SUPREME"); // zwykły prefiks
  });

  it("realne zdjęcia z repo pokrywają się z kolekcjami z Excela", async () => {
    const parsed = await parseCatalogXlsx(XLSX);
    const models = photoModelNames();
    expect(models.length).toBeGreaterThan(300);

    const match = matchModelsToRows(
      models,
      parsed.rows.map((r) => r.name),
    );

    // Większość modeli powinna znaleźć kolekcję — to realna miara jakości
    // dopasowania; próg celowo ostrożny, raport pokaże resztę.
    expect(match.assignments.size / models.length).toBeGreaterThan(0.7);

    // Żaden model nie może trafić do kolekcji o niepasującym prefiksie
    // (poza jawnie potwierdzonymi aliasami — lista jak CATALOG_ALIASES).
    const aliasPrefixes = ["CITI"];
    for (const [model, row] of match.assignments) {
      const m = model.toUpperCase();
      if (aliasPrefixes.some((a) => m === a || m.startsWith(`${a} `))) continue;
      const candidates = [
        row.toUpperCase(),
        ...row.toUpperCase().split("/").map((p) => p.trim()),
        row.toUpperCase().split(" ")[0],
      ];
      expect(
        candidates.some((c) => m === c || m.startsWith(`${c.split(" ")[0]}`)),
      ).toBe(true);
    }
  });
});
