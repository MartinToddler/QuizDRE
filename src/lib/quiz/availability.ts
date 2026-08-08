import "server-only";
import { loadCatalogSnapshot } from "@/lib/db/catalog";
import { createAdminClient } from "@/lib/db/server";
import {
  availableTypes,
  CATEGORY_TO_QTYPE,
  featureKindAvailability,
  MIN_POOL_FOR_TYPE,
  type Category,
} from "@/lib/engine";

/**
 * Kategorie z wystarczającą pulą pytań (mniejsze są ukrywane w UI).
 * Bez „mix” — picker trybu nauki realizuje go zaznaczeniem wszystkich.
 */
export async function availableCategories(): Promise<Category[]> {
  const db = createAdminClient();
  if (!db) return [];
  try {
    const snapshot = await loadCatalogSnapshot(db);
    const types = new Set(availableTypes(snapshot));
    // technical/dekory dzielą typ feature_yn — bramkujemy je pulą rodzaju.
    const kinds = featureKindAvailability(snapshot);
    return (
      Object.keys(CATEGORY_TO_QTYPE) as Exclude<Category, "mix">[]
    ).filter((c) => {
      if (c === "technical") return kinds.technical >= MIN_POOL_FOR_TYPE;
      if (c === "dekory") return kinds.dekor >= MIN_POOL_FOR_TYPE;
      return types.has(CATEGORY_TO_QTYPE[c]);
    });
  } catch {
    return [];
  }
}
