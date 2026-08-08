/**
 * Import próbek dekorów (materialy/dekory/*.jpg|jpeg|png|webp).
 *
 *   npx tsx scripts/import/dekory.ts [--dry-run] [--dir <ścieżka>]
 *
 * Nazwa pliku (bez rozszerzenia) = nazwa dekoru z arkusza katalogu;
 * wielkość liter, odstępy i polskie znaki bez znaczenia („dab sonoma 3d.jpg”
 * dopasuje „Dąb Sonoma 3D”). Obrazek ląduje w prywatnym buckecie pod
 * dekory/<slug>.<ext>, ścieżka w features.image_path — pytania o dekory
 * pokazują wtedy próbkę koloru obok zdjęcia modelu. Wymaga wcześniejszego
 * importu cech (zakres „cechy” lub „wszystko”).
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { foldName as fold } from "../../src/lib/engine/feature-copy";
import { featureKind } from "../../src/lib/engine/types";
import { adminClient, ensureBucket, levenshtein, STORAGE_BUCKET } from "../lib/db";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const DIR = args.includes("--dir")
  ? args[args.indexOf("--dir") + 1]
  : "materialy/dekory";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function slug(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Nazwa dekoru bez sufiksu kolizyjnego „ (grupa)” — jak w silniku. */
function baseName(name: string, category: string | null): string {
  const suffix = category ? ` (${category.trim()})` : "";
  return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

async function main() {
  let files: string[];
  try {
    files = readdirSync(DIR).filter((f) => CONTENT_TYPES[extname(f).toLowerCase()]);
  } catch {
    console.log(`Brak katalogu ${DIR} — nic do zrobienia.`);
    return;
  }
  if (files.length === 0) {
    console.log(`Brak obrazków w ${DIR} — nic do zrobienia.`);
    return;
  }
  console.log(`Znaleziono ${files.length} próbek w ${DIR}.`);

  const db = adminClient();
  const { data: features, error } = await db
    .from("features")
    .select("id, name, category, image_path");
  if (error) {
    if (error.code === "42703") {
      throw new Error(
        "Brak kolumny features.image_path — najpierw wykonaj migrację 0007_dekory.sql.",
      );
    }
    throw error;
  }

  const dekory = (features ?? []).filter((f) => featureKind(f.category) === "dekor");
  if (dekory.length === 0) {
    throw new Error(
      "Brak dekorów w bazie — najpierw uruchom import cech (zakres „cechy” lub „wszystko”).",
    );
  }

  // Pełna nazwa ma pierwszeństwo; nazwa bazowa (bez sufiksu grupy) tylko
  // gdy wskazuje dokładnie jeden dekor — inaczej raport niejednoznaczności.
  const byFull = new Map(dekory.map((f) => [fold(f.name), f]));
  const byBase = new Map<string, typeof dekory>();
  for (const f of dekory) {
    const key = fold(baseName(f.name, f.category));
    byBase.set(key, [...(byBase.get(key) ?? []), f]);
  }

  const matches: { file: string; feature: (typeof dekory)[number] }[] = [];
  const unmatched: string[] = [];
  const ambiguous: { file: string; candidates: string[] }[] = [];
  for (const file of files) {
    const key = fold(file.slice(0, -extname(file).length));
    const full = byFull.get(key);
    if (full) {
      matches.push({ file, feature: full });
      continue;
    }
    const base = byBase.get(key) ?? [];
    if (base.length === 1) {
      matches.push({ file, feature: base[0] });
    } else if (base.length > 1) {
      ambiguous.push({ file, candidates: base.map((f) => f.name) });
    } else {
      unmatched.push(file);
    }
  }

  console.log(`Dopasowano ${matches.length}/${files.length} plików do dekorów.`);
  if (ambiguous.length) {
    console.warn(`⚠ Niejednoznaczne (dekor w kilku grupach — nazwij plik pełną nazwą):`);
    ambiguous.forEach(({ file, candidates }) =>
      console.warn(`   ${file} → ${candidates.join(" / ")}`),
    );
  }
  if (unmatched.length) {
    console.warn(`⚠ Pliki bez dekoru w bazie (${unmatched.length}):`);
    for (const file of unmatched) {
      const key = fold(file.slice(0, -extname(file).length));
      const hint = dekory
        .map((f) => ({ f, d: levenshtein(key, fold(f.name)) }))
        .sort((a, b) => a.d - b.d)[0];
      console.warn(
        `   ${file}${hint && hint.d <= 3 ? ` (może „${hint.f.name}”?)` : ""}`,
      );
    }
  }

  const seen = new Map<string, string>();
  for (const { file, feature } of matches) {
    const prev = seen.get(feature.id);
    if (prev) console.warn(`⚠ ${file} nadpisuje ${prev} (ten sam dekor „${feature.name}”)`);
    seen.set(feature.id, file);
  }

  if (DRY) {
    console.log("\n--dry-run: bez zapisu.");
    return;
  }

  await ensureBucket(db);
  let uploaded = 0;
  for (const { file, feature } of matches) {
    const ext = extname(file).toLowerCase();
    const path = `dekory/${slug(feature.name)}${ext}`;
    const buf = readFileSync(join(DIR, file));
    const { error: e1 } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(path, buf, { contentType: CONTENT_TYPES[ext], upsert: true });
    if (e1) throw new Error(`Upload ${file}: ${e1.message}`);
    const { error: e2 } = await db
      .from("features")
      .update({ image_path: path })
      .eq("id", feature.id);
    if (e2) throw e2;
    uploaded += 1;
  }

  const missing = dekory.filter((f) => !seen.has(f.id) && !f.image_path);
  console.log(`\n✓ Wgrano ${uploaded} próbek.`);
  if (missing.length) {
    console.log(
      `ℹ Dekory wciąż bez próbki (${missing.length}): ` +
        missing.slice(0, 10).map((f) => f.name).join(" · ") +
        (missing.length > 10 ? " …" : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
