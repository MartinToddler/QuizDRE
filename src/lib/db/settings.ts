import "server-only";
import { createAdminClient } from "@/lib/db/server";
import {
  DEFAULT_QUESTION_MIX,
  questionMixSchema,
  type QuestionMix,
} from "@/lib/engine";

const QUESTION_MIX_KEY = "question_mix";

/**
 * Globalne proporcje pytań (panel admina). Fallback do DEFAULT_QUESTION_MIX,
 * gdy brak tabeli (okno przed migracją 0010), wiersza albo gdy zapisana
 * wartość nie przechodzi walidacji — gra nigdy nie zostaje bez wag.
 */
export async function getQuestionMix(): Promise<QuestionMix> {
  const db = createAdminClient();
  if (!db) return DEFAULT_QUESTION_MIX;
  const { data, error } = await db
    .from("app_settings")
    .select("value")
    .eq("key", QUESTION_MIX_KEY)
    .maybeSingle();
  if (error || !data) return DEFAULT_QUESTION_MIX;
  const parsed = questionMixSchema.safeParse(data.value);
  return parsed.success ? parsed.data : DEFAULT_QUESTION_MIX;
}

/** Zapis proporcji — wołać WYŁĄCZNIE po sprawdzeniu roli admina. */
export async function setQuestionMix(
  mix: QuestionMix,
  userId: string,
): Promise<{ error?: string }> {
  const db = createAdminClient();
  if (!db) return { error: "Brak konfiguracji Supabase" };
  const { error } = await db.from("app_settings").upsert(
    {
      key: QUESTION_MIX_KEY,
      value: mix,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "key" },
  );
  if (error) {
    if (error.code === "42P01") {
      return {
        error:
          "Brak tabeli app_settings — wykonaj migrację 0010_settings.sql w SQL Editorze.",
      };
    }
    return { error: `Nie udało się zapisać: ${error.message}` };
  }
  return {};
}
