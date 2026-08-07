"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";

const schema = z.object({
  displayName: z.string().trim().min(2).max(30),
  companyId: z.string().uuid(),
  reminderHour: z.coerce.number().int().min(0).max(23),
});

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = schema.safeParse({
    displayName: formData.get("displayName"),
    companyId: formData.get("companyId"),
    reminderHour: formData.get("reminderHour"),
  });
  if (!parsed.success) return { error: "Sprawdź wpisane dane." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Brak konfiguracji." };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesja wygasła." };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      company_id: parsed.data.companyId,
      preferred_reminder_hour: parsed.data.reminderHour,
    })
    .eq("id", user.id);

  if (error) return { error: "Nie udało się zapisać." };
  revalidatePath("/ustawienia");
  return { saved: true };
}
