import "server-only";
import { createAdminClient } from "@/lib/db/server";

export interface CompanyOption {
  id: string;
  name: string;
}

/** Domyślne firmy — seed z migracji 0001; tu jako samonaprawa produkcji. */
const DEFAULT_COMPANIES = ["DRE", "Inna firma"];

/**
 * Lista firm do wyboru (onboarding, ustawienia). Czyta service role —
 * niezależnie od RLS — a pustą tabelę jednorazowo zasiewa domyślnymi
 * firmami (bazy, na których seed z 0001 nie doszedł do skutku).
 * Wybór firmy jest opcjonalny, więc błędy degradują do pustej listy.
 */
export async function listCompanies(): Promise<CompanyOption[]> {
  const db = createAdminClient();
  if (!db) return [];

  const { data, error } = await db
    .from("companies")
    .select("id, name")
    .order("name");
  if (error) return [];
  if (data && data.length > 0) return data;

  const { error: seedError } = await db
    .from("companies")
    .upsert(
      DEFAULT_COMPANIES.map((name) => ({ name })),
      { onConflict: "name" },
    );
  if (seedError) return [];

  const { data: seeded } = await db
    .from("companies")
    .select("id, name")
    .order("name");
  return seeded ?? [];
}
