/**
 * Seed danych przykładowych — pozwala grać i rozwijać aplikację,
 * zanim pojawią się prawdziwe materiały DRE.
 *
 *   npx tsx scripts/import/seed-placeholder.ts [--replace]
 *
 * Tworzy: bucket, 12 modeli z wygenerowanymi zdjęciami (oryginał + lustro),
 * 15 cech z macierzą, pytania teoretyczne z materialy/teoria/, firmy demo.
 * Wszystko oznaczone metadata.placeholder = true.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { adminClient, ensureBucket, STORAGE_BUCKET } from "../lib/db";
import { doorSvg } from "../lib/door-svg";
import { mulberry32 } from "../../src/lib/engine/rng";

const REPLACE = process.argv.includes("--replace");

const COLLECTIONS = [
  { name: "Nova", color: "#c8b8a6" },
  { name: "Deco", color: "#8f8f8f" },
  { name: "Vetro", color: "#e8e4de" },
];

const FEATURES = [
  "Szyba hartowana",
  "Podcięcie wentylacyjne",
  "Zawiasy ukryte",
  "Okleina CPL",
  "Konstrukcja bezprzylgowa",
  "Wypełnienie płyta pełna",
  "Zamek magnetyczny",
  "Szyba satynowa",
  "Ościeżnica regulowana",
  "Wersja przesuwna",
  "Krawędź prosta",
  "Panel lustrzany",
  "Klamka w komplecie",
  "Wersja „80” i „90”",
  "Odporność na wilgoć",
];

async function main() {
  const db = adminClient();
  await ensureBucket(db);
  const rng = mulberry32(20260807);

  if (REPLACE) {
    await db.from("door_models").delete().eq("metadata->>placeholder", "true");
    console.log("Usunięto poprzednie modele placeholder.");
  }

  // --- Modele + zdjęcia ---
  const models: { name: string; collection: string; orig: string; mirror: string }[] = [];
  for (const col of COLLECTIONS) {
    for (let i = 1; i <= 4; i++) {
      const name = `${col.name} ${String(i).padStart(2, "0")}`;
      const hash = (v: string) =>
        createHash("sha1").update(`${name}|${v}|placeholder`).digest("hex");
      const origPath = `models/${hash("orig")}.jpg`;
      const mirrorPath = `models/${hash("mirror")}.jpg`;

      // oryginał: drzwi prawe (zawiasy po prawej), lustro przez flop
      const svg = doorSvg({
        orientation: "right",
        leafColor: col.color,
        variant: i + COLLECTIONS.indexOf(col),
      });
      const orig = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
      const mirror = await sharp(Buffer.from(svg)).flop().jpeg({ quality: 80 }).toBuffer();

      for (const [path, buf] of [
        [origPath, orig],
        [mirrorPath, mirror],
      ] as const) {
        const { error } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(path, buf, { contentType: "image/jpeg", upsert: true });
        if (error) throw new Error(`Upload ${path}: ${error.message}`);
      }
      models.push({ name, collection: col.name, orig: origPath, mirror: mirrorPath });
    }
  }

  const { data: insertedModels, error: e1 } = await db
    .from("door_models")
    .upsert(
      models.map((m) => ({
        name: m.name,
        collection: m.collection,
        original_orientation: "right",
        photo_original_path: m.orig,
        photo_mirrored_path: m.mirror,
        eligible_left_right: true,
        eligible_model_guess: true,
        active: true,
        metadata: { placeholder: true },
      })),
      { onConflict: "name" },
    )
    .select("id, name");
  if (e1) throw e1;
  console.log(`✓ ${insertedModels?.length} modeli ze zdjęciami (oryginał + lustro)`);

  // --- Cechy + macierz ---
  const { data: insertedFeatures, error: e2 } = await db
    .from("features")
    .upsert(FEATURES.map((name) => ({ name })), { onConflict: "name" })
    .select("id, name");
  if (e2) throw e2;

  const cells: { model_id: string; feature_id: string; has_feature: boolean }[] = [];
  for (const m of insertedModels ?? []) {
    for (const f of insertedFeatures ?? []) {
      cells.push({ model_id: m.id, feature_id: f.id, has_feature: rng.next() < 0.5 });
    }
  }
  const { error: e3 } = await db
    .from("model_features")
    .upsert(cells, { onConflict: "model_id,feature_id" });
  if (e3) throw e3;
  console.log(`✓ Macierz cech: ${cells.length} komórek`);

  // --- Pytania teoretyczne ---
  execSync("npx tsx scripts/import/theory.ts", { stdio: "inherit" });

  // --- Firmy demo ---
  const { error: e4 } = await db.from("companies").upsert(
    ["DRE", "Salon Drzwi Kowalscy", "BudMax", "Dom i Wnętrze", "Inna firma"].map(
      (name) => ({ name }),
    ),
    { onConflict: "name" },
  );
  if (e4) throw e4;
  console.log("✓ Firmy demo");

  console.log("\nSeed gotowy — można grać.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
