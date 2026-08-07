import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogSnapshot, Orientation } from "@/lib/engine";
import { SIGNED_URL_TTL_SECONDS, STORAGE_BUCKET } from "@/lib/env";

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
    db.from("features").select("id, name").eq("active", true),
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
    features: features.data ?? [],
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
