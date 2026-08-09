import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogSnapshot, Orientation } from "@/lib/engine";
import { SIGNED_URL_TTL_SECONDS, STORAGE_BUCKET } from "@/lib/env";

class PgError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

interface PageResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

/**
 * PostgREST zwraca maksymalnie ~1000 wierszy na zapytanie — większe tabele
 * (macierz cech to dziesiątki tysięcy komórek) trzeba dociągać stronami,
 * inaczej silnik widzi tylko początek alfabetu. Wywołujący MUSI ustawić
 * stabilny ORDER BY (klucz główny), żeby strony się nie rozjeżdżały.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new PgError(error.message, error.code);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

interface ModelRow {
  id: string;
  name: string;
  collection: string | null;
  original_orientation: string;
  photo_original_path: string | null;
  photo_mirrored_path: string | null;
  eligible_left_right: boolean;
  eligible_model_guess: boolean;
}

interface FeatureRow {
  id: string;
  name: string;
  category: string | null;
  image_path: string | null;
}

interface CellRow {
  model_id: string;
  feature_id: string;
  has_feature: boolean;
}

interface TheoryRow {
  id: string;
  category: string;
  question: string;
  answers: unknown;
  correct_index: number;
  explanation: string | null;
}

/** Kolumna image_path z 0007 może jeszcze nie istnieć (okno deploy → migracja). */
async function fetchFeatures(db: SupabaseClient): Promise<FeatureRow[]> {
  try {
    return await fetchAll<FeatureRow>((from, to) =>
      db
        .from("features")
        .select("id, name, category, image_path")
        .eq("active", true)
        .order("id")
        .range(from, to),
    );
  } catch (e) {
    if (!(e instanceof PgError) || e.code !== "42703") throw e;
    const legacy = await fetchAll<Omit<FeatureRow, "image_path">>((from, to) =>
      db
        .from("features")
        .select("id, name, category")
        .eq("active", true)
        .order("id")
        .range(from, to),
    );
    return legacy.map((f) => ({ ...f, image_path: null }));
  }
}

/**
 * Migawka katalogu dla generatorów — CAŁE tabele, stronami.
 * Wołać WYŁĄCZNIE z klientem service role.
 */
export async function loadCatalogSnapshot(
  db: SupabaseClient,
): Promise<CatalogSnapshot> {
  try {
    const [models, features, matrix, theory] = await Promise.all([
      fetchAll<ModelRow>((from, to) =>
        db
          .from("door_models")
          .select(
            "id, name, collection, original_orientation, photo_original_path, photo_mirrored_path, eligible_left_right, eligible_model_guess",
          )
          .eq("active", true)
          .order("id")
          .range(from, to),
      ),
      fetchFeatures(db),
      fetchAll<CellRow>((from, to) =>
        db
          .from("model_features")
          .select("model_id, feature_id, has_feature")
          .order("model_id")
          .order("feature_id")
          .range(from, to),
      ),
      fetchAll<TheoryRow>((from, to) =>
        db
          .from("theory_questions")
          .select("id, category, question, answers, correct_index, explanation")
          .eq("active", true)
          .order("id")
          .range(from, to),
      ),
    ]);

    return {
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        collection: m.collection,
        originalOrientation: m.original_orientation as Orientation,
        photoOriginalPath: m.photo_original_path,
        photoMirroredPath: m.photo_mirrored_path,
        eligibleLeftRight: m.eligible_left_right,
        eligibleModelGuess: m.eligible_model_guess,
      })),
      features: features.map((f) => ({
        id: f.id,
        name: f.name,
        category: f.category,
        imagePath: f.image_path,
      })),
      matrix: matrix.map((c) => ({
        modelId: c.model_id,
        featureId: c.feature_id,
        hasFeature: c.has_feature,
      })),
      theory: theory.map((t) => ({
        id: t.id,
        category: t.category,
        question: t.question,
        answers: t.answers as string[],
        correctIndex: t.correct_index,
        explanation: t.explanation,
      })),
    };
  } catch (e) {
    throw new Error(`Katalog: ${(e as Error).message}`);
  }
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
