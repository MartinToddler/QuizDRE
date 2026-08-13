"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin-guard";
import { setQuestionMix } from "@/lib/db/settings";
import { questionMixSchema } from "@/lib/engine";

export interface MixFormState {
  error?: string;
  saved?: boolean;
}

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
