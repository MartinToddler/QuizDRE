import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

export const STORAGE_BUCKET = "door-photos";

/** Klient service role dla skryptów importu (wymaga .env.local). */
export function adminClient(): SupabaseClient {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function ensureBucket(db: SupabaseClient): Promise<void> {
  const { data } = await db.storage.getBucket(STORAGE_BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: "5MB",
    });
    if (error && !error.message.includes("already exists")) throw error;
  }
}

/** Normalizacja nazw do porównań: małe litery, pojedyncze spacje. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Odległość Levenshteina — fuzzy match nazw modeli z raportem sugestii. */
export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}
