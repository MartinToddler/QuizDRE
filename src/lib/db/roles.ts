import "server-only";
import { createAdminClient } from "@/lib/db/server";

/**
 * Role użytkownika. Rola „user” jest NIEJAWNA (ma ją każdy zalogowany) —
 * user_roles przechowuje wyłącznie role podwyższone (np. „admin”).
 * Źródłem prawdy jest baza (świeży odczyt service role), nie JWT —
 * odebranie roli działa od następnego żądania.
 */
export async function getUserRoles(userId: string): Promise<Set<string>> {
  const db = createAdminClient();
  if (!db) return new Set();
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  // 42P01 = brak tabeli (okno przed migracją 0008) → brak ról podwyższonych
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.role as string));
}

export async function isAdmin(userId: string): Promise<boolean> {
  return (await getUserRoles(userId)).has("admin");
}
