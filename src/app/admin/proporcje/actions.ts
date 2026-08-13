"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-guard";
import { setDailyQuizSize, setQuestionMix } from "@/lib/db/settings";
import { dailyQuizSizeSchema, questionMixSchema } from "@/lib/engine";

export interface SettingFormState {
  error?: string;
  saved?: boolean;
}

/** Alias zachowany dla formularza proporcji. */
export type MixFormState = SettingFormState;

export async function saveQuestionMix(
  _prev: MixFormState,
  formData: FormData,
): Promise<MixFormState> {
  const user = await assertAdmin();

  const parsed = questionMixSchema.safeParse({
    models: formData.get("models"),
    technical: formData.get("technical"),
    dekory: formData.get("dekory"),
    left_right: formData.get("left_right"),
    theory: formData.get("theory"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe wagi" };
  }

  const { error } = await setQuestionMix(parsed.data, user.id);
  if (error) return { error };

  revalidatePath("/admin/proporcje");
  return { saved: true };
}

export async function saveDailyQuizSize(
  _prev: SettingFormState,
  formData: FormData,
): Promise<SettingFormState> {
  const user = await assertAdmin();

  const parsed = dailyQuizSizeSchema.safeParse(formData.get("size"));
  if (!parsed.success) {
    return { error: "Liczba pytań musi być z zakresu 5–30." };
  }

  const { error } = await setDailyQuizSize(parsed.data, user.id);
  if (error) return { error };

  revalidatePath("/admin/proporcje");
  return { saved: true };
}
