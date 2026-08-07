/**
 * Import cech z katalogowego arkusza specyfikacji DRE
 * (materialy/cechy/*.xlsx, np. „KATALOG specyfikacja kolekcji.xlsx”).
 *
 *   npx tsx scripts/import/features.ts [--dry-run] [--file <ścieżka>] [--sheet <nazwa>]
 *
 * Format pliku: patrz scripts/lib/catalog-xlsx.ts. W skrócie:
 * wiersze = KOLEKCJE, kolumny = cechy, „x” = dostępna, pusta = niedostępna.
 * Cechy kolekcji są przypisywane wszystkim modelom (zdjęciom) z bazy,
 * których nazwa zaczyna się od nazwy kolekcji (najdłuższy prefiks wygrywa).
 * Wiersze bez modeli i modele bez wiersza trafiają do raportu — nic nie
 * jest importowane po cichu ani zgadywane.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { adminClient } from "../lib/db";
import { matchModelsToRows, parseCatalogXlsx } from "../lib/catalog-xlsx";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SHEET = args.includes("--sheet") ? args[args.indexOf("--sheet") + 1] : undefined;
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

async function main() {
  console.log(`Czytam ${FILE}…`);
  const parsed = await parseCatalogXlsx(FILE, SHEET);
  const { features, rows, report } = parsed;

  const yes = rows.reduce((n, r) => n + r.values.filter((v) => v === true).length, 0);
  const no = rows.reduce((n, r) => n + r.values.filter((v) => v === false).length, 0);
  console.log(
    `Arkusz „${parsed.sheetName}”: ${features.length} cech, ${rows.length} kolekcji, ` +
      `${yes} × TAK (w tym ${report.footnoteYes} z przypisem), ${no} × NIE.`,
  );

  if (report.skippedEmptyRows.length) {
    console.log(
      `ℹ Pominięte wiersze bez wartości (sekcje/nagłówki): ${report.skippedEmptyRows
        .map((s) => s.name)
        .join(" · ")}`,
    );
  }
  if (report.duplicateRows.length) {
    console.warn(`⚠ Zduplikowane kolekcje (pominięte): ${report.duplicateRows.join(", ")}`);
  }
  if (report.ambiguous.length) {
    console.warn(`⚠ Niejednoznaczne komórki (pominięte, ${report.ambiguous.length}):`);
    report.ambiguous.slice(0, 15).forEach((a) =>
      console.warn(`   ${a.rowName} × ${a.feature}: „${a.value}”`),
    );
  }

  // Cechy podejrzane: wszędzie TAK / wszędzie NIE (na poziomie kolekcji)
  features.forEach((f, i) => {
    const vals = rows.map((r) => r.values[i]).filter((v): v is boolean => v !== null);
    if (vals.length === 0) return;
    const share = vals.filter(Boolean).length / vals.length;
    if (share === 0 || share === 1) {
      console.warn(`⚠ Cecha „${f.name}”: ${share === 1 ? "100% TAK" : "100% NIE"} — trafi do puli rzadziej`);
    }
  });

  const db = adminClient();
  const { data: models, error: e1 } = await db.from("door_models").select("id, name");
  if (e1) throw e1;
  if (!models?.length) {
    throw new Error(
      "Brak modeli w bazie — najpierw uruchom import zdjęć (zakres „zdjecia” lub „wszystko”).",
    );
  }

  const match = matchModelsToRows(
    models.map((m) => m.name),
    rows.map((r) => r.name),
  );

  console.log(
    `\nDopasowanie: ${match.assignments.size}/${models.length} modeli przypisanych do kolekcji.`,
  );
  if (match.unmatchedModels.length) {
    console.warn(
      `⚠ Modele bez kolekcji w Excelu (bez pytań o cechy, ${match.unmatchedModels.length}): ` +
        match.unmatchedModels.slice(0, 15).join(" · ") +
        (match.unmatchedModels.length > 15 ? " …" : ""),
    );
  }
  if (match.rowsWithoutModels.length) {
    console.warn(
      `⚠ Kolekcje bez modeli w bazie (pominięte, ${match.rowsWithoutModels.length}): ` +
        match.rowsWithoutModels.join(" · "),
    );
  }

  if (DRY) {
    console.log("\n--dry-run: bez zapisu.");
    return;
  }

  const { data: upsertedFeatures, error: e2 } = await db
    .from("features")
    .upsert(
      features.map((f) => ({ name: f.name, category: f.category })),
      { onConflict: "name" },
    )
    .select("id, name");
  if (e2) throw e2;
  const featureId = new Map((upsertedFeatures ?? []).map((f) => [f.name, f.id]));
  const rowByName = new Map(rows.map((r) => [r.name, r]));

  const cells: { model_id: string; feature_id: string; has_feature: boolean }[] = [];
  for (const m of models) {
    const rowName = match.assignments.get(m.name);
    if (!rowName) continue;
    const row = rowByName.get(rowName)!;
    features.forEach((f, i) => {
      const v = row.values[i];
      const fid = featureId.get(f.name);
      if (v === null || !fid) return;
      cells.push({ model_id: m.id, feature_id: fid, has_feature: v });
    });
  }

  for (let i = 0; i < cells.length; i += 500) {
    const { error } = await db
      .from("model_features")
      .upsert(cells.slice(i, i + 500), { onConflict: "model_id,feature_id" });
    if (error) throw error;
  }

  console.log(
    `\n✓ Zapisano ${cells.length} komórek macierzy ` +
      `(${match.assignments.size} modeli, ${features.length} cech).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
