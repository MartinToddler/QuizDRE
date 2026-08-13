import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/db/server";

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  companyName: string | null;
  isAdmin: boolean;
  lastSignInAt: string | null;
  /** Ostatnia odpowiedź w quizie (user_stats.updated_at) — granie ≠ logowanie. */
  lastActivityAt: string | null;
  totalXp: number;
  questionsAnswered: number;
  correctAnswers: number;
  currentStreak: number;
}

interface AuthInfo {
  email: string;
  lastSignInAt: string | null;
}

async function listAuthUsers(db: SupabaseClient): Promise<Map<string, AuthInfo>> {
  const out = new Map<string, AuthInfo>();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Lista użytkowników: ${error.message}`);
    for (const u of data.users) {
      out.set(u.id, {
        email: u.email ?? "—",
        lastSignInAt: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < perPage) break;
  }
  return out;
}

/** Użytkownicy z e-mailem, logowaniem i wskaźnikami — posortowani po XP. */
export async function listUsersWithStats(): Promise<AdminUserRow[]> {
  const db = createAdminClient();
  if (!db) return [];

  const [auth, profiles, stats, roles] = await Promise.all([
    listAuthUsers(db),
    db.from("profiles").select("id, display_name, companies(name)"),
    db
      .from("user_stats")
      .select(
        "user_id, total_xp, questions_answered, correct_answers, current_streak, updated_at",
      ),
    db.from("user_roles").select("user_id, role"),
  ]);

  const statsById = new Map(
    (stats.data ?? []).map((s) => [s.user_id as string, s]),
  );
  const admins = new Set(
    (roles.data ?? [])
      .filter((r) => r.role === "admin")
      .map((r) => r.user_id as string),
  );

  const rows: AdminUserRow[] = (profiles.data ?? []).map((p) => {
    const a = auth.get(p.id as string);
    const s = statsById.get(p.id as string);
    const companyRel = p.companies as unknown;
    const companyName = Array.isArray(companyRel)
      ? ((companyRel[0] as { name?: string } | undefined)?.name ?? null)
      : ((companyRel as { name?: string } | null)?.name ?? null);
    return {
      id: p.id as string,
      email: a?.email ?? "—",
      displayName: (p.display_name as string | null) ?? "—",
      companyName,
      isAdmin: admins.has(p.id as string),
      lastSignInAt: a?.lastSignInAt ?? null,
      lastActivityAt:
        s && s.questions_answered > 0 ? (s.updated_at as string) : null,
      totalXp: s?.total_xp ?? 0,
      questionsAnswered: s?.questions_answered ?? 0,
      correctAnswers: s?.correct_answers ?? 0,
      currentStreak: s?.current_streak ?? 0,
    };
  });

  return rows.sort((a, b) => b.totalXp - a.totalXp);
}

/**
 * Trwałe usunięcie konta wraz z CAŁYM postępem gry (kaskada z auth.users:
 * profil, statystyki, XP, odznaki, misje, sesje, subskrypcje push, role).
 * Zwolniony e-mail można natychmiast zarejestrować ponownie — stąd użycie
 * przy testach rejestracji.
 *
 * Wołać WYŁĄCZNIE po sprawdzeniu roli admina. `expectedEmail` to adres
 * potwierdzony w UI — serwer weryfikuje, że nadal należy do wskazanego
 * konta (ochrona przed nieaktualną listą).
 */
export async function deleteUserAccount(
  targetId: string,
  actorId: string,
  expectedEmail: string,
): Promise<{ deletedEmail?: string; error?: string }> {
  if (targetId === actorId) {
    return { error: "Nie można usunąć własnego konta." };
  }
  const db = createAdminClient();
  if (!db) return { error: "Brak konfiguracji Supabase" };

  const { data: target, error: lookupError } =
    await db.auth.admin.getUserById(targetId);
  if (lookupError || !target?.user) {
    return { error: "Nie znaleziono konta — odśwież listę." };
  }
  const email = target.user.email ?? "";
  if (email.toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    return {
      error: "Adres nie zgadza się z kontem — odśwież listę i spróbuj ponownie.",
    };
  }

  const { error } = await db.auth.admin.deleteUser(targetId);
  if (error) return { error: `Nie udało się usunąć konta: ${error.message}` };

  // Kontrola kaskady — lepiej jawny błąd niż ciche „usunięto”.
  const { data: leftover } = await db
    .from("profiles")
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (leftover) {
    return {
      error:
        "Konto usunięte z logowania, ale profil pozostał — sprawdź migrację 0012.",
    };
  }
  return { deletedEmail: email };
}

/** Liczba osób z aktywnością w quizie w ostatnich N dniach. */
export function countActiveSince(users: AdminUserRow[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return users.filter(
    (u) => u.lastActivityAt && new Date(u.lastActivityAt).getTime() >= cutoff,
  ).length;
}
