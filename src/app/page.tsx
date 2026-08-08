import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SetupNotice } from "@/components/setup-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/db/server";
import { DAILY_GOAL, getDashboard } from "@/lib/db/dashboard";
import { rankForXp } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase!.auth.getUser();
  if (!user) redirect("/logowanie");

  const { data: profile } = await supabase!
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.onboarded_at) redirect("/onboarding");

  const data = await getDashboard(user.id);
  if (!data) return <SetupNotice />;

  const rank = rankForXp(data.totalXp);
  const goalPct = Math.min(100, Math.round((data.answeredToday / DAILY_GOAL) * 100));

  return (
    <AppShell active="home">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* powitanie + streak */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cześć, {data.displayName}!</h1>
            <p className="text-sm text-gray-500">
              {data.answeredToday === 0
                ? "Dziś jeszcze zero pytań. Naprawimy to?"
                : `Dziś już ${data.answeredToday} pytań i ${data.xpToday} XP.`}
            </p>
          </div>
          <div className="text-center">
            <p className="text-3xl">🔥</p>
            <p className="text-xl font-black text-dre-600">{data.currentStreak}</p>
            <p className="text-[10px] font-semibold uppercase text-gray-400">
              dni serii{data.freezes > 0 ? ` · ❄️×${data.freezes}` : ""}
            </p>
          </div>
        </div>

        {/* ranga → statystyki */}
        <Link href="/profil" className="block">
          <Card className="transition-all hover:border-dre-400 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Twoja ranga
                </p>
                <p className="text-lg font-bold text-gray-800">{rank.name}</p>
              </div>
              <Chip tone="orange">{data.totalXp} XP</Chip>
            </div>
            {rank.next && (
              <>
                <Progress value={rank.progress * 100} className="mt-3" />
                <p className="mt-1.5 text-xs text-gray-400">
                  {rank.next.threshold - data.totalXp} XP do rangi „{rank.next.name}”
                </p>
              </>
            )}
            <p className="mt-2 text-xs font-semibold text-dre-600">
              Zobacz statystyki i odznaki →
            </p>
          </Card>
        </Link>

        {/* Quiz Dnia */}
        <Card className={data.dailyQuizDone ? "opacity-70" : "border-dre-300 bg-dre-50/60"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">
                📅 Quiz Dnia{" "}
                {data.dailyQuizDone && <span className="text-green-600">— zaliczony ✓</span>}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {data.dailyQuizDone
                  ? "Jutro nowy zestaw. Sprawdź, jak wypadasz na tle innych."
                  : "10 pytań, jedna próba, wszyscy grają to samo. Zestaw znika o północy."}
              </p>
            </div>
            {data.dailyQuizDone ? (
              <Link href="/ranking?t=daily_quiz">
                <Button variant="secondary" size="sm">Ranking dnia</Button>
              </Link>
            ) : (
              <Link href="/quiz/gra?mode=daily">
                <Button size="sm">Graj</Button>
              </Link>
            )}
          </div>
        </Card>

        {/* CTA trybów */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/quiz">
            <Card className="h-full transition-all hover:border-dre-400 hover:shadow-md">
              <p className="text-2xl">🎓</p>
              <p className="mt-1 font-bold">Nauka</p>
              <p className="text-sm text-gray-500">20 pytań z wybranej kategorii</p>
            </Card>
          </Link>
          <Link href="/quiz/gra?mode=challenge">
            <Card className="h-full transition-all hover:border-dre-400 hover:shadow-md">
              <p className="text-2xl">⚡</p>
              <p className="mt-1 font-bold">Wyzwanie</p>
              <p className="text-sm text-gray-500">
                Rekord: <span className="font-semibold text-dre-600">{data.bestChallenge}</span>
              </p>
            </Card>
          </Link>
        </div>

        {/* cel dzienny + misje */}
        <Card>
          <div className="flex items-center justify-between">
            <p className="font-bold">Misje dnia</p>
            <Chip tone={goalPct >= 100 ? "green" : "gray"}>
              cel dzienny {data.answeredToday}/{DAILY_GOAL}
            </Chip>
          </div>
          <div className="mt-3 space-y-3">
            {data.missions.map((m) => (
              <div key={m.code}>
                <div className="flex items-center justify-between text-sm">
                  <span className={m.done ? "text-gray-400 line-through" : "text-gray-700"}>
                    {m.done ? "✓ " : ""}
                    {m.title}
                  </span>
                  <span className="font-semibold text-dre-600">+{m.reward} XP</span>
                </div>
                <Progress
                  value={m.done ? m.target : m.progress}
                  max={m.target}
                  className="mt-1 h-1.5"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
