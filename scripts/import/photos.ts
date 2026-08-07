/**
 * Import zdjęć drzwi z materialy/zdjecia/.
 *
 *   npx tsx scripts/import/photos.ts [--dry-run] [--orientation right|left]
 *                                    [--dir materialy/zdjecia] [--replace]
 *
 * - nazwa pliku (bez rozszerzenia) = nazwa modelu; kolekcja = pierwszy wyraz
 * - generuje wersję lustrzaną (sharp flop), oba pliki: resize 1200px, JPEG q80,
 *   bez EXIF, nazwy = sha1 (nieodróżnialne w DevTools)
 * - upsert door_models + raport i checklista przeglądu eligibility
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { adminClient, ensureBucket, STORAGE_BUCKET } from "../lib/db";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const REPLACE = args.includes("--replace");
const DIR = args.includes("--dir")
  ? args[args.indexOf("--dir") + 1]
  : "materialy/zdjecia";
// Potwierdzone: wszystkie oryginały mają jednolity układ; domyślnie 'right'
// (zawiasy po prawej patrząc od strony otwierania). Zmień flagą, jeśli inaczej.
const ORIENTATION = (
  args.includes("--orientation") ? args[args.indexOf("--orientation") + 1] : "right"
) as "left" | "right";

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const SALT = process.env.PHOTO_HASH_SALT ?? "quizdre-v1";

function hashName(model: string, variant: "orig" | "mirror"): string {
  return createHash("sha1").update(`${model}|${variant}|${SALT}`).digest("hex");
}

function collectionOf(model: string): string | null {
  const first = model.split(" ")[0];
  return first && first.length >= 2 ? first : null;
}

async function processImage(buf: Buffer, mirror: boolean): Promise<Buffer> {
  let img = sharp(buf).rotate(); // auto-orient wg EXIF, potem EXIF znika
  if (mirror) img = img.flop();
  return img
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function main() {
  const files = readdirSync(DIR).filter((f) => EXTENSIONS.has(extname(f).toLowerCase()));
  if (files.length === 0) {
    console.log(`Brak zdjęć w ${DIR} — nic do zrobienia.`);
    return;
  }

  console.log(`Znaleziono ${files.length} zdjęć. Orientacja oryginałów: ${ORIENTATION}.`);
  const plan = files.map((f) => {
    const model = basename(f, extname(f)).replace(/\s+/g, " ").trim();
    return { file: f, model, collection: collectionOf(model) };
  });

  const dupes = plan.filter(
    (p, i) => plan.findIndex((q) => q.model.toLowerCase() === p.model.toLowerCase()) !== i,
  );
  if (dupes.length) {
    console.warn(`⚠ Zduplikowane modele (drugie pliki pominięte): ${dupes.map((d) => d.file).join(", ")}`);
  }
  const unique = plan.filter(
    (p, i) => plan.findIndex((q) => q.model.toLowerCase() === p.model.toLowerCase()) === i,
  );

  if (DRY) {
    for (const p of unique) console.log(`  ${p.file} → model „${p.model}” (kolekcja: ${p.collection ?? "—"})`);
    console.log("\n--dry-run: bez zapisu.");
    return;
  }

  const db = adminClient();
  await ensureBucket(db);

  if (REPLACE) {
    await db.from("door_models").update({ active: false }).eq("metadata->>placeholder", "true");
    console.log("Dezaktywowano modele placeholder.");
  }

  let ok = 0;
  for (const p of unique) {
    const raw = readFileSync(join(DIR, p.file));
    const orig = await processImage(raw, false);
    const mirror = await processImage(raw, true);
    const origPath = `models/${hashName(p.model, "orig")}.jpg`;
    const mirrorPath = `models/${hashName(p.model, "mirror")}.jpg`;

    for (const [path, buf] of [
      [origPath, orig],
      [mirrorPath, mirror],
    ] as const) {
      const { error } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(path, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(`Upload ${path}: ${error.message}`);
    }

    const { error } = await db.from("door_models").upsert(
      {
        name: p.model,
        collection: p.collection,
        original_orientation: ORIENTATION,
        photo_original_path: origPath,
        photo_mirrored_path: mirrorPath,
        eligible_left_right: true,
        eligible_model_guess: true,
        active: true,
      },
      { onConflict: "name" },
    );
    if (error) throw new Error(`Upsert ${p.model}: ${error.message}`);
    ok += 1;
    console.log(`  ✓ ${p.model}`);
  }

  const { data: withoutPhoto } = await db
    .from("door_models")
    .select("name")
    .is("photo_original_path", null)
    .eq("active", true);

  console.log(`\nZaimportowano ${ok} modeli ze zdjęciami.`);
  if (withoutPhoto?.length) {
    console.log(`⚠ Modele bez zdjęć (tylko pytania o cechy): ${withoutPhoto.map((m) => m.name).join(", ")}`);
  }
  console.log(
    "\nCHECKLISTA przeglądu (pytania prawe/lewe):\n" +
      "  – zdjęcia idealnie symetryczne / bez widocznej klamki,\n" +
      "  – napisy lub logo widoczne na szybie (lustro je odwróci),\n" +
      "wyklucz je: update door_models set eligible_left_right = false where name in (...);",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
