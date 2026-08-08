import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogSnapshot, Orientation } from "@/lib/engine";
import { SIGNED_URL_TTL_SECONDS, STORAGE_BUCKET } from "@/lib/env";

/** Kolumna z 0007 może jeszcze nie istnieć (okno deploy → migracja). */
async function selectFeatures(db: SupabaseClient) {
  const full = await db
    .from("features")
    .select("id, name, category, image_path")
    .eq("active", true);
  if (full.error?.code !== "42703") return full;
  const legacy = await db.from("features").select("id, name, category").eq("active", true);
  return {
    ...legacy,
    data: legacy.data?.map((f) => ({ ...f, image_path: null })) ?? null,
  };
}

/**
 * Migawka katalogu dla generatorów. Dane są małe (setki wierszy) —
 * ładujemy całość; wołać WYŁĄCZNIE z klientem service role.
 */
export async function loadCatalogSnapshot(
  db: SupabaseClient,
): Promise<CatalogSnapshot> {
  const [models, features, matrix, theory] = await Promise.all([
    db
      .from("door_models")
      .select(
        "id, name, collection, original_orientation, photo_original_path, photo_mirrored_path, eligible_left_right, eligible_model_guess",
      )
      .eq("active", true),
    selectFeatures(db),
    db.from("model_features").select("model_id, feature_id, has_feature"),
    db
      .from("theory_questions")
      .select("id, category, question, answers, correct_index, explanation")
      .eq("active", true),
  ]);

  for (const r of [models, features, matrix, theory]) {
    if (r.error) throw new Error(`Katalog: ${r.error.message}`);
  }

  return {
    models: (models.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      collection: m.collection,
      originalOrientation: m.original_orientation as Orientation,
      photoOriginalPath: m.photo_original_path,
      photoMirroredPath: m.photo_mirrored_path,
      eligibleLeftRight: m.eligible_left_right,
      eligibleModelGuess: m.eligible_model_guess,
    })),
    features: (features.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      imagePath: f.image_path,
    })),
    matrix: (matrix.data ?? []).map((c) => ({
      modelId: c.model_id,
      featureId: c.feature_id,
      hasFeature: c.has_feature,
    })),
    theory: (theory.data ?? []).map((t) => ({
      id: t.id,
      category: t.category,
      question: t.question,
      answers: t.answers as string[],
      correctIndex: t.correct_index,
      explanation: t.explanation,
    })),
  };
}

/** Krótkotrwały signed URL do prywatnego zdjęcia. */
export async function signImagePath(
  db: SupabaseClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await db.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

/** Zbiorcze signed URLs — jedna runda do Storage zamiast N osobnych. */
export async function signImagePaths(
  db: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return out;
  const { data, error } = await db.storage
    .from(STORAGE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return out;
  for (const d of data) {
    if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}
