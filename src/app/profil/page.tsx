import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { createSupabaseServerClient } from "@/lib/db/server";
import { rankForXp } from "@/lib/engine";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  learning: "Nauka",
  challenge: "Wyzwanie",
  daily: "Quiz Dnia",
};

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/logowanie");

  const [profileRes, statsRes, badgesRes, myBadgesRes, historyRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, company_id, companies(name)")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("badges")
        .select("id, name, description, icon, xp_reward, sort_order")
        .eq("active", true)
        .order("sort_order"),
      supabase.from("user_badges").select("badge_id, awarded_at").eq("user_id", user.id),
      supabase
        .from("quiz_sessions")
        .select("id, mode, category, status, correct_count, question_count, xp_earned, started_at")
        .eq("user_id", user.id)
        .neq("status", "active")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

  const stats = statsRes.data;
  const totalXp = stats?.total_xp ?? 0;
  const rank = rankForXp(totalXp);
  const owned = new Map(
    (myBadgesRes.data ?? []).map((b) => [b.badge_id, b.awarded_at]),
  );
  const accuracy =
    stats && stats.questions_answered > 0
      ? Math.round((stats.correct_answers / stats.questions_answered) * 100)
      : 0;
  const companyRel = profileRes.data?.companies as unknown;
  const companyName = Array.isArray(companyRel)
    ? ((companyRel[0] as { name?: string } | undefined)?.name ?? "—")
    : ((companyRel as { name?: string } | null)?.name ?? "—");

  return (
    <AppShell active="profil">
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-dre-50 text-3xl">
              🚪
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">
                {profileRes.data?.display_name ?? "Gracz"}
              </h1>
              <p className="text-sm text-gray-500">{companyName}</p>
            </div>
            <Chip tone="orange">{rank.name}</Chip>
          </div>
          {rank.next && (
            <>
              <Progress value={rank.progress * 100} className="mt-4" />
              <p className="mt-1.5 text-xs text-gray-400">
                {totalXp} XP · do „{rank.next.name}”: {rank.next.threshold - totalXp} XP
              </p>
            </>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Seria dni", value: `${stats?.current_streak ?? 0} 🔥` },
            { label: "Najdłuższa seria", value: stats?.longest_streak ?? 0 },
            { label: "Celność", value: `${accuracy}%` },
            { label: "Rekord wyzwania", value: stats?.best_challenge_score ?? 0 },
          ].map((s) => (
            <Card key={s.label} className="p-4 text-center">
              <p className="text-xl font-black text-gray-800">{s.value}</p>
              <p className="mt-0.5 text-xs text-gray-400">{s.label}</p>
            </Card>
          ))}
        </div>

        <Card>
          <h2 className="font-bold">
            Odznaki{" "}
            <span className="text-sm font-normal text-gray-400">
              ({owned.size}/{badgesRes.data?.length ?? 0})
            </span>
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(badgesRes.data ?? []).map((b) => {
              const has = owned.has(b.id);
              return (
                <div
                  key={b.id}
                  title={b.description}
                  className={cn(
                    "rounded-xl border p-3 text-center",
                    has
                      ? "border-dre-200 bg-dre-50/60"
                      : "border-gray-100 bg-gray-50 opacity-50 grayscale",
                  )}
                >
                  <p className="text-2xl">{b.icon}</p>
                  <p className="mt-1 text-xs font-semibold leading-tight">{b.name}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="font-bold">Ostatnie sesje</h2>
          {historyRes.data?.length ? (
            <ul className="mt-2 divide-y divide-gray-100">
              {historyRes.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-semibold">
                      {MODE_LABEL[s.mode] ?? s.mode}
                      {s.mode === "learning" && s.category ? (
                        <span className="ml-1 text-xs text-gray-400">({s.category})</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(s.started_at).toLocaleString("pl-PL", {
                        timeZone: "Europe/Warsaw",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      {s.mode === "challenge"
                        ? `${s.correct_count} z rzędu`
                        : `${s.correct_count}/${s.question_count}`}
                    </p>
                    <p className="text-xs text-dre-600">+{s.xp_earned} XP</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">
              Historia pojawi się po pierwszej sesji.
            </p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
