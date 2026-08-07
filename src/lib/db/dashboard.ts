import "server-only";
import { createAdminClient } from "@/lib/db/server";
import { warsawToday } from "@/lib/quiz/service";

export const DAILY_GOAL = 20;

export interface MissionView {
  code: string;
  title: string;
  reward: number;
  progress: number;
  target: number;
  done: boolean;
}

export interface DashboardData {
  displayName: string;
  totalXp: number;
  currentStreak: number;
  freezes: number;
  answeredToday: number;
  xpToday: number;
  dailyQuizDone: boolean;
  bestChallenge: number;
  missions: MissionView[];
}

function warsawDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Dane dashboardu — service role (spójne źródła, jedna ścieżka). */
export async function getDashboard(userId: string): Promise<DashboardData | null> {
  const db = createAdminClient();
  if (!db) return null;
  const today = warsawToday();

  const dayAgo = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const [profileRes, statsRes, xpRes, sessionsRes, missionsRes] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    db.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
    db.from("xp_events").select("amount").eq("user_id", userId).eq("day_warsaw", today),
    db
      .from("quiz_sessions")
      .select("mode, status, correct_count, wrong_count, max_combo, started_at")
      .eq("user_id", userId)
      .gte("started_at", dayAgo),
    db
      .from("mission_completions")
      .select("mission_code")
      .eq("user_id", userId)
      .eq("day_warsaw", today),
  ]);

  const stats = statsRes.data;
  const sessionsToday = (sessionsRes.data ?? []).filter(
    (s) => warsawDateOf(s.started_at) === today,
  );
  const answeredToday = sessionsToday.reduce(
    (acc, s) => acc + s.correct_count + s.wrong_count,
    0,
  );
  const maxComboToday = sessionsToday.reduce((acc, s) => Math.max(acc, s.max_combo), 0);
  const dailyQuizDone = sessionsToday.some(
    (s) => s.mode === "daily" && s.status !== "active",
  );
  const completed = new Set((missionsRes.data ?? []).map((m) => m.mission_code));

  // Zestaw misji MUSI odpowiadać ewaluacji w finish_session (0004).
  const missions: MissionView[] = [
    {
      code: "daily_goal_20",
      title: "Cel dzienny: 20 pytań",
      reward: 15,
      progress: Math.min(answeredToday, DAILY_GOAL),
      target: DAILY_GOAL,
      done: completed.has("daily_goal_20"),
    },
    {
      code: "combo_8",
      title: "Combo x8 w jednej sesji",
      reward: 10,
      progress: Math.min(maxComboToday, 8),
      target: 8,
      done: completed.has("combo_8"),
    },
    {
      code: "daily_quiz_done",
      title: "Ukończ Quiz Dnia",
      reward: 10,
      progress: dailyQuizDone ? 1 : 0,
      target: 1,
      done: completed.has("daily_quiz_done"),
    },
  ];

  return {
    displayName: profileRes.data?.display_name ?? "Graczu",
    totalXp: stats?.total_xp ?? 0,
    currentStreak: stats?.current_streak ?? 0,
    freezes: stats?.streak_freezes ?? 0,
    answeredToday,
    xpToday: (xpRes.data ?? []).reduce((acc, e) => acc + e.amount, 0),
    dailyQuizDone,
    bestChallenge: stats?.best_challenge_score ?? 0,
    missions,
  };
}
