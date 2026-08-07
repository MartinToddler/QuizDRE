/**
 * Parser katalogowego arkusza specyfikacji DRE
 * („KATALOG specyfikacja kolekcji.xlsx”).
 *
 * Realny układ (arkusze typu 2025_3):
 *   - wiersz z „kolekcja / dekor KATALOG” w kolumnie 2 = nagłówek;
 *     nazwy cech od kolumny 3, kategorie cech w wierszu powyżej
 *     (scalone komórki — przenoszone w prawo),
 *   - kolejne wiersze = kolekcje („Ilis”, „Vetro D2”, „Arte”…),
 *     przedzielone sekcjami („DRZWI RAMOWE”) bez żadnych wartości,
 *   - wartości: x / X / x* = cecha dostępna (gwiazdki to przypisy),
 *     PUSTA komórka = cecha NIEDOSTĘPNA (tak działa ta macierz!),
 *     cokolwiek innego (np. „ZN”) = niejednoznaczne → pomijane + raport.
 *
 * Zdjęcia nazwane są MODELAMI („ARTE 10”), a wiersze to KOLEKCJE — stąd
 * matchModelsToRows: model dostaje cechy wiersza o najdłuższym pasującym
 * prefiksie nazwy (dzięki temu „VETRO D2 20” trafia do „Vetro D2”,
 * a nie do „Vetro E”).
 */
import ExcelJS from "exceljs";

export interface CatalogFeature {
  name: string;
  category: string | null;
}

export interface CatalogRow {
  /** Nazwa kolekcji po czyszczeniu (bez przypisów „*”). */
  name: string;
  sourceRow: number;
  /** Wartość per cecha (indeks jak w features); null = niejednoznaczne. */
  values: (boolean | null)[];
}

export interface CatalogParse {
  sheetName: string;
  features: CatalogFeature[];
  rows: CatalogRow[];
  report: {
    skippedEmptyRows: { row: number; name: string }[];
    duplicateRows: string[];
    ambiguous: { rowName: string; feature: string; value: string }[];
    footnoteYes: number;
  };
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return String(v.result ?? "");
    if ("text" in v) return String(v.text ?? "");
  }
  return String(v);
}

export function cleanRowName(raw: string): string {
  return raw
    .replace(/\*+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type CellNorm = boolean | null | "empty";

function normalizeCatalogCell(raw: string): CellNorm {
  const s = raw.trim();
  if (s === "") return "empty";
  if (/^x\*{0,3}$/i.test(s)) return true;
  return null; // niejednoznaczne (np. „ZN”)
}

export async function parseCatalogXlsx(
  path: string,
  sheetName?: string,
): Promise<CatalogParse> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const sheet = sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets.find((w) => w.rowCount > 0);
  if (!sheet) {
    throw new Error(
      sheetName
        ? `Brak arkusza „${sheetName}” (dostępne: ${workbook.worksheets.map((w) => w.name).join(", ")})`
        : "Plik nie zawiera arkusza z danymi",
    );
  }

  // Nagłówek: OSTATNI wiersz z „kolekcja / dekor” w kolumnie 2
  // (bywa scalony na 2 wiersze — właściwe nazwy cech są w dolnym).
  let headerRowNo = 0;
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    if (/kolekcja\s*\/\s*dekor/i.test(cellText(sheet.getRow(r).getCell(2)))) {
      headerRowNo = r;
    }
  }
  if (!headerRowNo) {
    throw new Error(
      `Arkusz „${sheet.name}”: nie znalazłem wiersza nagłówka („kolekcja / dekor” w kolumnie 2).`,
    );
  }

  const headerRow = sheet.getRow(headerRowNo);
  const categoryRow = sheet.getRow(headerRowNo - 1);

  const features: CatalogFeature[] = [];
  const featureCols: number[] = [];
  let carriedCategory: string | null = null;
  for (let c = 3; c <= sheet.columnCount; c++) {
    const catRaw = cellText(categoryRow.getCell(c)).replace(/\s+/g, " ").trim();
    if (catRaw && !/kolekcja\s*\/\s*dekor/i.test(catRaw)) carriedCategory = catRaw;
    const name = cellText(headerRow.getCell(c)).replace(/\s+/g, " ").trim();
    if (!name) continue;
    features.push({ name, category: carriedCategory });
    featureCols.push(c);
  }

  const rows: CatalogRow[] = [];
  const report: CatalogParse["report"] = {
    skippedEmptyRows: [],
    duplicateRows: [],
    ambiguous: [],
    footnoteYes: 0,
  };
  const seen = new Set<string>();

  for (let r = headerRowNo + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = cleanRowName(cellText(row.getCell(2)));
    if (!name) continue;

    const values: (boolean | null)[] = [];
    let filled = 0;
    for (let i = 0; i < featureCols.length; i++) {
      const raw = cellText(row.getCell(featureCols[i]));
      const norm = normalizeCatalogCell(raw);
      if (norm === "empty") {
        values.push(false); // pusta komórka = cecha niedostępna
      } else if (norm === null) {
        values.push(null);
        report.ambiguous.push({ rowName: name, feature: features[i].name, value: raw.trim() });
        filled += 1;
      } else {
        values.push(true);
        filled += 1;
        if (/\*/.test(raw)) report.footnoteYes += 1;
      }
    }

    // Sekcje („DRZWI RAMOWE”) i wiersze bez żadnej wartości — poza importem.
    if (filled === 0) {
      report.skippedEmptyRows.push({ row: r, name });
      continue;
    }
    const key = name.toUpperCase();
    if (seen.has(key)) {
      report.duplicateRows.push(name);
      continue;
    }
    seen.add(key);
    rows.push({ name, sourceRow: r, values });
  }

  return { sheetName: sheet.name, features, rows, report };
}

/* ------------------------------------------------------------------ */
/* Mapowanie: model (nazwa zdjęcia) → wiersz kolekcji                  */
/* ------------------------------------------------------------------ */

export interface ModelRowMatch {
  /** model (oryginalna nazwa) → nazwa wiersza kolekcji */
  assignments: Map<string, string>;
  unmatchedModels: string[];
  rowsWithoutModels: string[];
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Kandydujące prefiksy dla wiersza: pełna nazwa, części po „/”, skracanie od prawej. */
function rowCandidates(rowName: string): string[] {
  const out = new Set<string>();
  const base = norm(rowName);
  out.add(base);
  for (const part of base.split("/")) {
    const p = part.trim();
    if (p.length >= 3) out.add(p);
  }
  const words = base.split(" ");
  for (let take = words.length - 1; take >= 1; take--) {
    const prefix = words.slice(0, take).join(" ");
    if (prefix.length >= 3) out.add(prefix);
  }
  return [...out];
}

export function matchModelsToRows(
  modelNames: string[],
  rowNames: string[],
): ModelRowMatch {
  // kandydat-prefiks → wiersz; przy konflikcie wygrywa dłuższy prefiks,
  // a przy równych długościach pełna nazwa wiersza przed skróconą.
  const candidateToRow = new Map<string, { row: string; exactness: number }>();
  for (const rowName of rowNames) {
    const cands = rowCandidates(rowName);
    cands.forEach((cand, idx) => {
      const exactness = idx === 0 ? 1 : 0;
      const existing = candidateToRow.get(cand);
      if (!existing || exactness > existing.exactness) {
        candidateToRow.set(cand, { row: rowName, exactness });
      }
    });
  }

  const assignments = new Map<string, string>();
  const unmatchedModels: string[] = [];
  const usedRows = new Set<string>();

  for (const model of modelNames) {
    const m = norm(model);
    let best: { cand: string; row: string } | null = null;
    for (const [cand, target] of candidateToRow) {
      if (m === cand || m.startsWith(`${cand} `)) {
        if (!best || cand.length > best.cand.length) {
          best = { cand, row: target.row };
        }
      }
    }
    if (best) {
      assignments.set(model, best.row);
      usedRows.add(best.row);
    } else {
      unmatchedModels.push(model);
    }
  }

  return {
    assignments,
    unmatchedModels,
    rowsWithoutModels: rowNames.filter((r) => !usedRows.has(r)),
  };
}
