"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import type { AnswerValue, Category, Mode, QuestionPayload } from "@/lib/engine";
import { AnswerGrid } from "./answers";
import { ResultScreen, type SessionSummary } from "./result";

interface QuestionDto {
  seq: number;
  qtype: string;
  payload: QuestionPayload;
  imageUrl: string | null;
  swatchUrl: string | null;
}

interface SessionStartDto {
  sessionId: string;
  mode: Mode;
  total: number;
  answered: number;
  correct: number;
  xpEarned: number;
  resumed: boolean;
  questions: QuestionDto[];
}

interface AnswerResultDto {
  correct: boolean;
  correctAnswer: AnswerValue;
  explanation: string | null;
  comment: string;
  xp: number;
  combo: number;
  milestoneBonus: number;
  sessionStatus: "active" | "finished";
  correctCount: number;
  answeredCount: number;
  newQuestions: QuestionDto[];
}

type Phase =
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "playing" }
  | { kind: "summary"; summary: SessionSummary; comment: string | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      // brak JSON w odpowiedzi błędu
    }
    throw new Error(code);
  }
  return (await res.json()) as T;
}

export function QuizGame({
  mode,
  categories,
}: {
  mode: Mode;
  categories?: Category[];
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<AnswerValue | null>(null);
  const [feedback, setFeedback] = useState<AnswerResultDto | null>(null);
  const [sessionXp, setSessionXp] = useState(0);
  const [score, setScore] = useState(0); // poprawne z rzędu (wyzwanie)
  const [total, setTotal] = useState(0); // pełna długość sesji (nauka)
  const [answeredBase, setAnsweredBase] = useState(0); // odpowiedziane przed wznowieniem
  const [resumed, setResumed] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const servedRef = useRef<Set<number>>(new Set());
  // Ref na listę pytań: timeout auto-przejścia w wyzwaniu musi widzieć
  // partie doklejone PO utworzeniu domknięcia (świeżą długość listy).
  const questionsRef = useRef<QuestionDto[]>([]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const finish = useCallback(async (sid: string) => {
    try {
      const res = await api<{ summary: SessionSummary; comment: string | null }>(
        `/api/quiz/sessions/${sid}/finish`,
        { method: "POST" },
      );
      setPhase({ kind: "summary", summary: res.summary, comment: res.comment });
    } catch (e) {
      setPhase({ kind: "error", code: (e as Error).message });
    }
  }, []);

  // Start sesji (raz — ref chroni przed podwójnym efektem w dev).
  // Serwer zwraca od razu WSZYSTKIE pytania (payloady bez odpowiedzi).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await api<SessionStartDto>("/api/quiz/sessions", {
          method: "POST",
          body: JSON.stringify({ mode, categories }),
        });
        setSessionId(res.sessionId);
        setQuestions(res.questions);
        setTotal(res.total);
        setAnsweredBase(res.answered);
        setScore(res.correct);
        setSessionXp(res.xpEarned);
        setResumed(res.resumed);
        // pierwsze z serwowanych pytań jest już oznaczone po stronie serwera
        if (res.questions[0]) servedRef.current.add(res.questions[0].seq);
        setPhase({ kind: "playing" });
      } catch (e) {
        setPhase({ kind: "error", code: (e as Error).message });
      }
    })();
    return () => {
      if (autoNextRef.current) clearTimeout(autoNextRef.current);
    };
  }, [mode, categories]);

  // Beacon „pytanie wyświetlone” — startuje serwerowy pomiar czasu.
  const markServed = useCallback(
    (seq: number) => {
      if (!sessionId || servedRef.current.has(seq)) return;
      servedRef.current.add(seq);
      void fetch(`/api/quiz/sessions/${sessionId}/served`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: seq }),
        keepalive: true,
      }).catch(() => {
        // brak beacona = brak bonusu za szybkość; odpowiedź i tak przejdzie
      });
    },
    [sessionId],
  );

  // Przy każdym wyświetleniu pytania: beacon + preload obrazków w przód.
  useEffect(() => {
    if (phase.kind !== "playing") return;
    const current = questions[idx];
    if (current) markServed(current.seq);
    for (const q of questions.slice(idx, idx + 4)) {
      for (const url of [q.imageUrl, q.swatchUrl]) {
        if (url) {
          const img = new Image();
          img.src = url;
        }
      }
    }
  }, [phase.kind, idx, questions, markServed]);

  // Feedback pojawia się pod odpowiedziami — na telefonie dociągamy go w kadr.
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (feedback) {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [feedback]);

  const advance = useCallback(
    (res: AnswerResultDto) => {
      if (autoNextRef.current) {
        clearTimeout(autoNextRef.current);
        autoNextRef.current = null;
      }
      const hasNext =
        res.sessionStatus === "active" && idx + 1 < questionsRef.current.length;
      if (!hasNext) {
        setPhase({ kind: "loading" });
        if (sessionId) void finish(sessionId);
        return;
      }
      setIdx((i) => i + 1);
      setSelected(null);
      setFeedback(null);
    },
    [idx, sessionId, finish],
  );

  async function answer(value: AnswerValue) {
    const question = questions[idx];
    if (!sessionId || !question || selected || busy) return;
    setSelected(value);
    setBusy(true);
    try {
      const res = await api<AnswerResultDto>(
        `/api/quiz/sessions/${sessionId}/answers`,
        {
          method: "POST",
          body: JSON.stringify({ position: question.seq, answer: value }),
        },
      );
      setFeedback(res);
      setSessionXp((xp) => xp + res.xp);
      setScore(res.correctCount);
      if (res.newQuestions.length > 0) {
        setQuestions((prev) => {
          const known = new Set(prev.map((q) => q.seq));
          return [...prev, ...res.newQuestions.filter((q) => !known.has(q.seq))];
        });
      }
      // Wyzwanie: poprawna odpowiedź płynie dalej sama.
      if (mode === "challenge" && res.correct) {
        autoNextRef.current = setTimeout(() => advance(res), 1000);
      }
    } catch (e) {
      const code = (e as Error).message;
      if (code === "too_fast") {
        setSelected(null); // spróbuj jeszcze raz, spokojniej
      } else {
        setPhase({ kind: "error", code });
      }
    } finally {
      setBusy(false);
    }
  }

  async function exitGame() {
    if (mode === "challenge" && sessionId && phase.kind === "playing") {
      if (!confirm("Przerwać? Dotychczasowy wynik zostanie zapisany.")) return;
      setPhase({ kind: "loading" });
      await finish(sessionId);
      return;
    }
    router.push("/quiz");
  }

  /* ----------------------------- widoki ----------------------------- */

  if (phase.kind === "loading") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Spinner className="size-8" />
        <p className="text-sm text-gray-500">Przygotowuję pytania…</p>
      </div>
    );
  }

  if (phase.kind === "error") {
    const messages: Record<string, string> = {
      daily_already_played: "Dzisiejszy Quiz Dnia już zaliczony. Wróć jutro!",
      no_questions: "Baza pytań jest pusta — najpierw zaimportuj dane.",
      unauthorized: "Sesja wygasła. Zaloguj się ponownie.",
      migration_required:
        "Nowa wersja czeka na migrację bazy — wklej supabase/migrations/0007_dekory.sql w Supabase SQL Editor.",
    };
    return (
      <div className="mx-auto max-w-sm py-16 text-center">
        <p className="text-4xl">🚪</p>
        <p className="mt-4 font-semibold">
          {messages[phase.code] ?? `Coś poszło nie tak (${phase.code}).`}
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="secondary">Wróć na start</Button>
        </Link>
      </div>
    );
  }

  if (phase.kind === "summary") {
    const againHref =
      mode === "learning"
        ? `/quiz/gra?mode=learning&categories=${(categories ?? ["mix"]).join(",")}`
        : mode === "challenge"
          ? "/quiz/gra?mode=challenge"
          : "/";
    return (
      <ResultScreen
        summary={phase.summary}
        comment={phase.comment}
        playAgainHref={againHref}
      />
    );
  }

  const question = questions[idx];
  if (!question) return null;
  const answeredCount = feedback?.answeredCount ?? answeredBase + idx;
  const correctCount = feedback?.correctCount ?? score;

  return (
    <div className="mx-auto max-w-xl">
      {/* nagłówek gry */}
      <div className="flex items-center gap-3">
        <button
          onClick={exitGame}
          aria-label="Zakończ grę"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          ✕
        </button>
        {mode === "challenge" ? (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-lg">⚡</span>
            <span className="text-lg font-black text-dre-600">{correctCount}</span>
            <span className="text-sm text-gray-400">z rzędu</span>
          </div>
        ) : (
          <div className="flex-1">
            <Progress value={answeredCount} max={total || questions.length} />
          </div>
        )}
        {feedback && feedback.combo >= 2 && (
          <Chip tone="orange" className="animate-pop">x{feedback.combo}</Chip>
        )}
        <Chip tone="gray" key={sessionXp} className={sessionXp > 0 ? "animate-pop" : ""}>
          {sessionXp} XP
        </Chip>
      </div>

      {mode !== "challenge" && (
        <p className="mt-2 text-xs font-medium text-gray-400">
          Pytanie {answeredBase + idx + 1} z {total || questions.length}
        </p>
      )}

      {resumed && idx === 0 && !feedback && (
        <p className="mt-2 inline-block rounded-lg bg-dre-50 px-3 py-1.5 text-xs font-medium text-dre-700">
          ↻ Wznowiono przerwaną sesję — gramy od miejsca, w którym stanęło.
        </p>
      )}

      {/* pytanie */}
      <h1 className="mt-4 text-xl font-bold leading-snug">{question.payload.prompt}</h1>

      {(question.imageUrl || question.swatchUrl) && (
        <div className="mt-4 flex items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
          {/* Zdjęcia z prywatnego bucketu (signed URL) — bez next/image */}
          {question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.imageUrl}
              alt="Drzwi — spójrz uważnie"
              className={cn(
                "rounded-lg object-contain",
                question.swatchUrl ? "max-h-64" : "max-h-80",
              )}
              draggable={false}
            />
          )}
          {question.swatchUrl && (
            <figure className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={question.swatchUrl}
                alt="Próbka dekoru"
                className="size-24 rounded-lg border border-gray-200 object-cover shadow-sm"
                draggable={false}
              />
              <figcaption className="mt-1 text-[11px] font-medium text-gray-400">
                dekor
              </figcaption>
            </figure>
          )}
        </div>
      )}

      <div className="mt-5">
        <AnswerGrid
          payload={question.payload}
          selected={selected}
          correct={feedback ? feedback.correctAnswer : null}
          onAnswer={answer}
        />
      </div>

      {/* feedback */}
      {feedback && (
        <Card
          ref={feedbackRef}
          className={cn(
            "mt-4 animate-rise border-2",
            feedback.correct ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={cn("font-bold", feedback.correct ? "text-green-700" : "text-red-700")}>
                {feedback.correct ? "Dobrze!" : "Niestety nie."}
              </p>
              <p className="mt-1 text-sm italic text-gray-600">{feedback.comment}</p>
              {feedback.explanation && (
                <p className="mt-2 text-sm text-gray-600">{feedback.explanation}</p>
              )}
              {feedback.milestoneBonus > 0 && (
                <p className="mt-2 text-sm font-semibold text-dre-600">
                  Kamień milowy! +{feedback.milestoneBonus} XP
                </p>
              )}
            </div>
            {feedback.correct && (
              <span className="shrink-0 rounded-full bg-green-600 px-2.5 py-1 text-sm font-bold text-white">
                +{feedback.xp} XP
              </span>
            )}
          </div>
          {!(mode === "challenge" && feedback.correct) && (
            <Button onClick={() => advance(feedback)} className="mt-3 w-full" size="md">
              {feedback.sessionStatus === "finished" || idx + 1 >= questions.length
                ? "Zobacz wynik"
                : "Dalej"}
            </Button>
          )}
        </Card>
      )}

      {busy && !feedback && (
        <div className="mt-4 flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
