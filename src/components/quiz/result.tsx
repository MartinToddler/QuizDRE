"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PushOptInCard } from "@/components/push-opt-in";
import { RANKS } from "@/lib/engine";
import { ConfettiBurst } from "./confetti";

export interface SessionSummary {
  mode: "learning" | "challenge" | "daily";
  answered: number;
  correct: number;
  total: number;
  maxCombo: number;
  xpSession: number;
  perfect: boolean;
  bonuses: { learning: number; perfect: number; daily: number; streak: number };
  streak: {
    current: number;
    longest: number;
    freezes: number;
    firstToday: boolean;
    usedFreeze: boolean;
    earnedFreeze: boolean;
  };
  newBadges: { id: string; name: string; icon: string; description: string; xpReward: number }[];
  missions: { code: string; title: string; reward: number }[];
  rankBefore: number;
  rankAfter: number;
  totalXp: number;
  isChallengeRecord: boolean;
  bestChallenge: number;
}

export function ResultScreen({
  summary,
  comment,
  playAgainHref,
}: {
  summary: SessionSummary;
  comment: string | null;
  playAgainHref: string;
}) {
  const rankUp = summary.rankAfter > summary.rankBefore;
  const celebrate =
    rankUp || summary.newBadges.length > 0 || summary.perfect || summary.isChallengeRecord;
  const accuracy =
    summary.answered > 0 ? Math.round((summary.correct / summary.answered) * 100) : 0;

  return (
    <div className="mx-auto max-w-md animate-rise space-y-4">
      {celebrate && <ConfettiBurst big={rankUp || summary.isChallengeRecord} />}

      <Card className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          {summary.mode === "challenge"
            ? "Wyzwanie zakończone"
            : summary.mode === "daily"
              ? "Quiz Dnia ukończony"
              : "Sesja nauki ukończona"}
        </p>

        {summary.mode === "challenge" ? (
          <>
            <p className="mt-3 text-6xl font-black text-dre-500">{summary.correct}</p>
            <p className="mt-1 text-gray-500">poprawnych z rzędu</p>
            {summary.isChallengeRecord ? (
              <Chip tone="orange" className="mt-3">🏆 Nowy rekord życiowy!</Chip>
            ) : (
              <p className="mt-2 text-sm text-gray-400">
                Rekord: {summary.bestChallenge}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-5xl font-black text-gray-800">
              {summary.correct}
              <span className="text-2xl text-gray-400">/{summary.total}</span>
            </p>
            <p className="mt-1 text-gray-500">celność {accuracy}%</p>
            {summary.perfect && <Chip tone="orange" className="mt-3">💎 Perfekcja!</Chip>}
          </>
        )}

        {comment && <p className="mt-4 text-sm italic text-gray-500">„{comment}”</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <span className="font-semibold">Zdobyte XP</span>
          <span className="text-xl font-black text-dre-500">+{summary.xpSession}</span>
        </div>
        <div className="mt-2 space-y-1 text-sm text-gray-500">
          {summary.bonuses.learning > 0 && (
            <p>Ukończenie sesji: +{summary.bonuses.learning}</p>
          )}
          {summary.bonuses.perfect > 0 && <p>Bonus 20/20: +{summary.bonuses.perfect}</p>}
          {summary.bonuses.daily > 0 && <p>Quiz Dnia: +{summary.bonuses.daily}</p>}
          {summary.bonuses.streak > 0 && (
            <p>Seria dni: +{summary.bonuses.streak}</p>
          )}
          {summary.maxCombo >= 2 && <p>Najdłuższe combo: x{summary.maxCombo}</p>}
        </div>
      </Card>

      {summary.streak.firstToday && (
        <Card className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div>
            <p className="font-bold">Seria: {summary.streak.current} dni</p>
            <p className="text-sm text-gray-500">
              {summary.streak.usedFreeze && "Zamrożenie uratowało serię! "}
              {summary.streak.earnedFreeze && "Zdobywasz zamrożenie serii. "}
              Zamrożenia w zapasie: {summary.streak.freezes}
            </p>
          </div>
        </Card>
      )}

      {rankUp && (
        <Card className="border-dre-300 bg-dre-50 text-center">
          <p className="text-sm font-semibold text-dre-700">AWANS!</p>
          <p className="mt-1 text-xl font-black text-dre-700">
            {RANKS[summary.rankAfter]?.name}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            poprzednio: {RANKS[summary.rankBefore]?.name}
          </p>
        </Card>
      )}

      {summary.newBadges.map((b) => (
        <Card key={b.id} className="flex items-center gap-3 border-dre-200">
          <span className="text-3xl">{b.icon}</span>
          <div className="flex-1">
            <p className="font-bold">Nowa odznaka: {b.name}</p>
            <p className="text-sm text-gray-500">{b.description}</p>
          </div>
          {b.xpReward > 0 && <Chip tone="orange">+{b.xpReward} XP</Chip>}
        </Card>
      ))}

      {summary.missions.map((m) => (
        <Card key={m.code} className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <p className="font-semibold">Misja: {m.title}</p>
          </div>
          <Chip tone="green">+{m.reward} XP</Chip>
        </Card>
      ))}

      <PushOptInCard />

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Link href={playAgainHref}>
          <Button className="w-full">Jeszcze raz</Button>
        </Link>
        <Link href="/ranking">
          <Button variant="secondary" className="w-full">
            Rankingi
          </Button>
        </Link>
      </div>
      <Link href="/" className="block text-center text-sm text-gray-500 hover:underline">
        Wróć na start
      </Link>
    </div>
  );
}
