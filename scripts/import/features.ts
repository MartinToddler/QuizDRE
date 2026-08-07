/**
 * Import macierzy cech z Excela (materialy/cechy/*.xlsx).
 *
 *   npx tsx scripts/import/features.ts [--dry-run] [--file <ścieżka>] [--fuzzy]
 *
 * Układ: wiersz 1 = nazwy cech (od kolumny 2), kolumna 1 = nazwy modeli.
 * Normalizacja: TAK/x/✓/1/true → TAK; NIE/-/–/0/false → NIE;
 * puste/niejednoznaczne → POMINIĘTE + raport (nigdy cichy import).
 * Modele nieistniejące w bazie są tworzone (bez zdjęć — działa typ 1).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { adminClient, levenshtein, normalizeName } from "../lib/db";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FUZZY = args.includes("--fuzzy");
const FILE = args.includes("--file")
  ? args[args.indexOf("--file") + 1]
  : (() => {
      const dir = "materialy/cechy";
      const xlsx = readdirSync(dir).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~"));
      if (xlsx.length === 0) {
        console.log(`Brak plików .xlsx w ${dir} — nic do zrobienia.`);
        process.exit(0);
      }
      return join(dir, xlsx[0]);
    })();

const TRUE_VALUES = new Set(["tak", "x", "✓", "✔", "1", "true", "prawda", "jest"]);
const FALSE_VALUES = new Set(["nie", "-", "–", "—", "0", "false", "brak"]);

function normalizeCell(value: unknown): boolean | "empty" | "ambiguous" {
  if (value === null || value === undefined) return "empty";
  const s = String(value).trim().toLowerCase();
  if (s === "") return "empty";
  if (TRUE_VALUES.has(s)) return true;
  if (FALSE_VALUES.has(s)) return false;
  return "ambiguous";
}

async function main() {
  console.log(`Czytam ${FILE}…`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Brak arkusza w pliku");

  const headerRow = sheet.getRow(1);
  const features: { col: number; name: string }[] = [];
  headerRow.eachCell((cell, col) => {
    if (col === 1) return;
    const name = String(cell.value ?? "").trim();
    if (name) features.push({ col, name });
  });

  const rows: { model: string; cells: Map<string, boolean> }[] = [];
  const report = { empty: 0, ambiguous: [] as string[], duplicateModels: [] as string[] };
  const seenModels = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const model = String(row.getCell(1).value ?? "").replace(/\s+/g, " ").trim();
    if (!model) return;
    if (seenModels.has(normalizeName(model))) {
      report.duplicateModels.push(model);
      return;
    }
    seenModels.add(normalizeName(model));

    const cells = new Map<string, boolean>();
    for (const f of features) {
      const v = normalizeCell(row.getCell(f.col).value);
      if (v === "empty") report.empty += 1;
      else if (v === "ambiguous") {
        report.ambiguous.push(`${model} × ${f.name}: „${row.getCell(f.col).value}”`);
      } else cells.set(f.name, v);
    }
    rows.push({ model, cells });
  });

  console.log(`Modele: ${rows.length}, cechy: ${features.length}`);
  if (report.duplicateModels.length)
    console.warn(`⚠ Zduplikowane wiersze modeli (pominięte): ${report.duplicateModels.join(", ")}`);
  if (report.empty) console.warn(`⚠ Puste komórki (pominięte): ${report.empty}`);
  if (report.ambiguous.length) {
    console.warn(`⚠ Niejednoznaczne wartości (pominięte):`);
    report.ambiguous.slice(0, 20).forEach((a) => console.warn(`   ${a}`));
    if (report.ambiguous.length > 20) console.warn(`   …i ${report.ambiguous.length - 20} więcej`);
  }

  // Cechy podejrzane: wszędzie TAK albo wszędzie NIE
  for (const f of features) {
    const values = rows.map((r) => r.cells.get(f.name)).filter((v) => v !== undefined);
    if (values.length === 0) continue;
    const share = values.filter(Boolean).length / values.length;
    if (share === 0 || share === 1) {
      console.warn(`⚠ Cecha „${f.name}”: ${share === 1 ? "100% TAK" : "100% NIE"} — do weryfikacji`);
    }
  }

  if (DRY) {
    console.log("\n--dry-run: bez zapisu.");
    return;
  }

  const db = adminClient();

  const { data: existingModels, error: e1 } = await db
    .from("door_models")
    .select("id, name");
  if (e1) throw e1;
  const modelByNorm = new Map((existingModels ?? []).map((m) => [normalizeName(m.name), m]));

  // Fuzzy match nazw z Excela do modeli z bazy (raport lub auto przy --fuzzy)
  for (const r of rows) {
    if (modelByNorm.has(normalizeName(r.model))) continue;
    const near = (existingModels ?? [])
      .map((m) => ({ m, d: levenshtein(normalizeName(r.model), normalizeName(m.name)) }))
      .filter((x) => x.d > 0 && x.d <= 2)
      .sort((a, b) => a.d - b.d)[0];
    if (near) {
      if (FUZZY) {
        console.log(`↺ Fuzzy: „${r.model}” → „${near.m.name}”`);
        r.model = near.m.name;
      } else {
        console.warn(`⚠ „${r.model}” nie istnieje; podobne: „${near.m.name}” (użyj --fuzzy, by dopasować)`);
      }
    }
  }

  // Upsert modeli (nowe — bez zdjęć) i cech
  const { data: upsertedModels, error: e2 } = await db
    .from("door_models")
    .upsert(
      rows.map((r) => ({
        name: modelByNorm.get(normalizeName(r.model))?.name ?? r.model,
        eligible_left_right: modelByNorm.has(normalizeName(r.model)) ? undefined : false,
      })),
      { onConflict: "name", ignoreDuplicates: false },
    )
    .select("id, name");
  if (e2) throw e2;

  const { data: upsertedFeatures, error: e3 } = await db
    .from("features")
    .upsert(features.map((f) => ({ name: f.name })), { onConflict: "name" })
    .select("id, name");
  if (e3) throw e3;

  const modelId = new Map((upsertedModels ?? []).map((m) => [normalizeName(m.name), m.id]));
  const featureId = new Map((upsertedFeatures ?? []).map((f) => [f.name, f.id]));

  const cells: { model_id: string; feature_id: string; has_feature: boolean }[] = [];
  for (const r of rows) {
    const mid = modelId.get(normalizeName(r.model));
    if (!mid) continue;
    for (const [fname, has] of r.cells) {
      const fid = featureId.get(fname);
      if (fid) cells.push({ model_id: mid, feature_id: fid, has_feature: has });
    }
  }

  for (let i = 0; i < cells.length; i += 500) {
    const { error } = await db
      .from("model_features")
      .upsert(cells.slice(i, i + 500), { onConflict: "model_id,feature_id" });
    if (error) throw error;
  }

  console.log(`\n✓ Zapisano ${cells.length} komórek macierzy (${rows.length} modeli × ${features.length} cech).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
