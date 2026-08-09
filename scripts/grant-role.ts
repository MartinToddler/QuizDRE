/**
 * Nadawanie / odbieranie ról podwyższonych (RBAC, migracja 0008).
 *
 *   npx tsx scripts/grant-role.ts --email osoba@firma.pl [--role admin] [--revoke]
 *
 * Rola „user” jest niejawna (ma ją każdy zalogowany) — tu zarządzamy tylko
 * rolami ze słownika `roles` (dziś: admin). Użytkownik musi mieć konto
 * (zalogować się przynajmniej raz). Zwykle odpalane workflowem
 * „Rola admina” z zakładki Actions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./lib/db";

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const EMAIL = argValue("--email");
const ROLE = argValue("--role") ?? "admin";
const REVOKE = args.includes("--revoke");

async function findUserIdByEmail(
  db: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Lista użytkowników: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function main() {
  if (!EMAIL || !EMAIL.includes("@")) {
    console.error("Podaj adres: --email osoba@firma.pl");
    process.exit(1);
  }

  const db = adminClient();

  const { data: role, error: roleError } = await db
    .from("roles")
    .select("name")
    .eq("name", ROLE)
    .maybeSingle();
  if (roleError) {
    if (roleError.code === "42P01") {
      throw new Error(
        "Brak tabeli roles — najpierw wykonaj migrację 0008_roles.sql w SQL Editorze.",
      );
    }
    throw roleError;
  }
  if (!role) {
    const { data: all } = await db.from("roles").select("name").order("name");
    throw new Error(
      `Nieznana rola „${ROLE}”. Dostępne: ${(all ?? []).map((r) => r.name).join(", ") || "(brak)"}.`,
    );
  }

  const userId = await findUserIdByEmail(db, EMAIL);
  if (!userId) {
    throw new Error(
      `Brak użytkownika ${EMAIL} — musi najpierw zalogować się do aplikacji.`,
    );
  }

  if (REVOKE) {
    const { error, count } = await db
      .from("user_roles")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("role", ROLE);
    if (error) throw error;
    console.log(
      count
        ? `✓ Odebrano rolę „${ROLE}”: ${EMAIL}`
        : `ℹ ${EMAIL} nie miał roli „${ROLE}” — nic do zrobienia.`,
    );
    return;
  }

  const { error } = await db
    .from("user_roles")
    .upsert({ user_id: userId, role: ROLE }, { onConflict: "user_id,role" });
  if (error) throw error;
  console.log(`✓ Nadano rolę „${ROLE}”: ${EMAIL}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
