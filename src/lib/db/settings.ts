import "server-only";
import { createAdminClient } from "@/lib/db/server";
import {
  DAILY_QUIZ_SIZE,
  DEFAULT_QUESTION_MIX,
  dailyQuizSizeSchema,
  questionMixSchema,
  type QuestionMix,
} from "@/lib/engine";

const QUESTION_MIX_KEY = "question_mix";
const DAILY_QUIZ_SIZE_KEY = "daily_quiz_size";

/**
 * Odczyt globalnego ustawienia z app_settings. Każdy błąd (brak tabeli
 * przed migracją 0010/0011, brak wiersza, nieprawidłowa wartość) kończy się
 * fallbackiem — gra nigdy nie zostaje bez konfiguracji.
 */
async function getSetting<T>(
  key: string,
  parse: (value: unknown) => T | null,
  fallback: T,
): Promise<T> {
  const db = createAdminClient();
  if (!db) return fallback;
  const { data, error } = await db
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return parse(data.value) ?? fallback;
}

/** Zapis ustawienia — wołać WYŁĄCZNIE po sprawdzeniu roli admina. */
async function setSetting(
  key: string,
  value: unknown,
  userId: string,
  migration: string,
): Promise<{ error?: string }> {
  const db = createAdminClient();
  if (!db) return { error: "Brak konfiguracji Supabase" };
  const { error } = await db.from("app_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "key" },
  );
  if (error) {
    if (error.code === "42P01") {
      return {
        error: `Brak tabeli app_settings — wykonaj migrację ${migration} w SQL Editorze.`,
      };
    }
    return { error: `Nie udało się zapisać: ${error.message}` };
  }
  return {};
}

/** Globalne proporcje kategorii pytań (panel admina → Proporcje). */
export function getQuestionMix(): Promise<QuestionMix> {
  return getSetting(
    QUESTION_MIX_KEY,
    (v) => questionMixSchema.safeParse(v).data ?? null,
    DEFAULT_QUESTION_MIX,
  );
}

export function setQuestionMix(mix: QuestionMix, userId: string) {
  return setSetting(QUESTION_MIX_KEY, mix, userId, "0010_settings.sql");
}

/** Liczba pytań w Quizie Dnia (panel admina → Proporcje). */
export function getDailyQuizSize(): Promise<number> {
  return getSetting(
    DAILY_QUIZ_SIZE_KEY,
    (v) => dailyQuizSizeSchema.safeParse(v).data ?? null,
    DAILY_QUIZ_SIZE,
  );
}

export function setDailyQuizSize(size: number, userId: string) {
  return setSetting(DAILY_QUIZ_SIZE_KEY, size, userId, "0011_daily_quiz_size.sql");
}
