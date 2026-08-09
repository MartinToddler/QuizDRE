"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";

const schema = z.object({
  displayName: z.string().trim().min(2, "Nick musi mieć min. 2 znaki").max(30),
  // wybór firmy jest opcjonalny — pusta wartość = bez firmy
  companyId: z.union([z.literal(""), z.string().uuid()]),
  reminderHour: z.coerce.number().int().min(0).max(23),
});

export interface OnboardingState {
  error?: string;
}

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    companyId: formData.get("companyId"),
    reminderHour: formData.get("reminderHour"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Brak konfiguracji Supabase" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/logowanie");

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      company_id: parsed.data.companyId || null,
      preferred_reminder_hour: parsed.data.reminderHour,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Nie udało się zapisać profilu. Spróbuj ponownie." };
  }

  redirect("/");
}
