import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

type Tab = "daily" | "monthly" | "alltime" | "challenge" | "companies" | "daily_quiz";

const TABS: { key: Tab; label: string }[] = [
  { key: "daily", label: "Dziś" },
  { key: "monthly", label: "Miesiąc" },
  { key: "alltime", label: "Od początku" },
  { key: "challenge", label: "Wyzwanie" },
  { key: "daily_quiz", label: "Quiz Dnia" },
  { key: "companies", label: "Firmy" },
];

interface Row {
  rank: number;
  name: string;
  company: string | null;
  xp?: number;
  score?: number;
  isMe?: boolean;
  users?: number;
  avgXp?: number;
  totalXp?: number;
  total?: number;
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/logowanie");

  const { t } = await searchParams;
  const tab: Tab = (TABS.some((x) => x.key === t) ? t : "daily") as Tab;

  let rows: Row[] = [];
  let me: { rank: number; xp?: number; score?: number } | null = null;
  let emptyText = "Jeszcze pusto. Zagraj i otwórz tabelę!";

  if (tab === "companies") {
    const { data } = await supabase.rpc("get_company_leaderboard");
    rows = (data?.top as Row[]) ?? [];
    emptyText =
      "Firma pojawia się w rankingu, gdy w danym miesiącu gra z niej min. 3 osoby.";
  } else if (tab === "challenge") {
    const { data } = await supabase.rpc("get_challenge_leaderboard", { p_limit: 50 });
    rows = (data?.top as Row[]) ?? [];
    me = data?.me ?? null;
  } else if (tab === "daily_quiz") {
    const { data } = await supabase.rpc("get_daily_quiz_leaderboard", { p_limit: 50 });
    rows = (data?.top as Row[]) ?? [];
    me = data?.me ?? null;
    emptyText = "Nikt nie zagrał dziś Quizu Dnia. Możesz być pierwszą osobą!";
  } else {
    const { data } = await supabase.rpc("get_leaderboard", {
      p_period: tab,
      p_limit: 50,
    });
    rows = (data?.top as Row[]) ?? [];
    me = data?.me ?? null;
  }

  return (
    <AppShell active="ranking">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Rankingi</h1>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((x) => (
            <Link
              key={x.key}
              href={`/ranking?t=${x.key}`}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                tab === x.key
                  ? "bg-dre-500 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100",
              )}
            >
              {x.label}
            </Link>
          ))}
        </div>

        {me && (
          <Card className="mt-4 flex items-center justify-between border-dre-200 bg-dre-50/60">
            <span className="text-sm font-semibold text-gray-600">Twoja pozycja</span>
            <span className="font-black text-dre-600">
              #{me.rank}
              <span className="ml-2 text-sm font-semibold text-gray-500">
                {me.xp !== undefined ? `${me.xp} XP` : `${me.score} pkt`}
              </span>
            </span>
          </Card>
        )}

        <Card className="mt-4 p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">{emptyText}</p>
          ) : (
            <ol>
              {rows.map((r, i) => (
                <li
                  key={`${r.rank}-${r.name}-${i}`}
                  className={cn(
                    "flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0",
                    r.isMe && "bg-dre-50/70",
                  )}
                >
                  <span
                    className={cn(
                      "w-8 text-center font-black",
                      r.rank === 1
                        ? "text-xl"
                        : r.rank <= 3
                          ? "text-dre-600"
                          : "text-gray-400",
                    )}
                  >
                    {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {r.name}
                      {r.isMe && <span className="ml-1 text-xs text-dre-600">(Ty)</span>}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      {tab === "companies"
                        ? `${r.users} graczy · łącznie ${r.totalXp} XP`
                        : (r.company ?? "")}
                    </p>
                  </div>
                  <Chip tone={r.rank <= 3 ? "orange" : "gray"}>
                    {tab === "companies"
                      ? `${r.avgXp} XP/os.`
                      : tab === "challenge"
                        ? `${r.score} z rzędu`
                        : tab === "daily_quiz"
                          ? `${r.score}/${r.total}`
                          : `${r.xp} XP`}
                  </Chip>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {tab === "companies" && (
          <p className="mt-3 text-center text-xs text-gray-400">
            Ranking miesięczny: średnia XP na aktywnego gracza (min. 3 osoby z firmy).
          </p>
        )}
      </div>
    </AppShell>
  );
}
