"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import {
  ANSWER_TIME_LIMIT_MS,
  pickComment,
  randomRng,
  type AnswerValue,
  type Category,
  type Mode,
  type QuestionPayload,
} from "@/lib/engine";
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
  timeMs: number;
  xp: number;
  combo: number;
  milestoneBonus: number;
  sessionStatus: "active" | "finished";
  correctCount: number;
  answeredCount: number;
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
  resumeSessionId,
}: {
  mode: Mode;
  categories?: Category[];
  /** Z parametru `sesja` w URL — odświeżenie strony wznawia tę sesję. */
  resumeSessionId?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<AnswerValue | null>(null);
  const [feedback, setFeedback] = useState<AnswerResultDto | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [sessionXp, setSessionXp] = useState(0);
  const [score, setScore] = useState(0); // poprawne z rzędu (wyzwanie)
  const [total, setTotal] = useState(0); // pełna długość sesji (nauka)
  const [answeredBase, setAnsweredBase] = useState(0); // odpowiedziane przed wznowieniem
  const [resumed, setResumed] = useState(false);
  const [busy, setBusy] = useState(false);
  const limitMs = ANSWER_TIME_LIMIT_MS[mode];
  const [remainingMs, setRemainingMs] = useState(limitMs);
  const startedRef = useRef(false);
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const servedRef = useRef<Set<number>>(new Set());
  // Historia poprawności — kontekst narratora (wrongStreak/comeback) liczony
  // lokalnie, żeby serwer nie robił dodatkowych zapytań przy werdykcie.
  const historyRef = useRef<boolean[]>([]);
  const extendingRef = useRef(false);
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
          body: JSON.stringify({ mode, categories, resume: resumeSessionId }),
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
        // Id sesji do adresu (bez nawigacji) — odświeżenie wznowi TĘ sesję,
        // a świadome wejście z pickera (bez `sesja`) zawsze zacznie nową.
        const url = new URLSearchParams({ mode });
        if (categories?.length) url.set("categories", categories.join(","));
        url.set("sesja", res.sessionId);
        window.history.replaceState(null, "", `/quiz/gra?${url.toString()}`);
        setPhase({ kind: "playing" });
      } catch (e) {
        setPhase({ kind: "error", code: (e as Error).message });
      }
    })();
    return () => {
      if (autoNextRef.current) clearTimeout(autoNextRef.current);
    };
  }, [mode, categories, resumeSessionId]);

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

  // Dogrywka partii wyzwania — w tle, z zapasem; werdykt na nią nie czeka.
  const extendQuestions = useCallback(async (): Promise<void> => {
    if (!sessionId || extendingRef.current) return;
    extendingRef.current = true;
    try {
      const res = await api<{ questions: QuestionDto[] }>(
        `/api/quiz/sessions/${sessionId}/extend`,
        { method: "POST" },
      );
      const known = new Set(questionsRef.current.map((q) => q.seq));
      const fresh = res.questions.filter((q) => !known.has(q.seq));
      if (fresh.length > 0) {
        const merged = [...questionsRef.current, ...fresh];
        questionsRef.current = merged; // od razu — advance() czyta ref
        setQuestions(merged);
      }
    } catch {
      // brak dogrywki ≠ błąd gry; advance spróbuje ponownie
    } finally {
      extendingRef.current = false;
    }
  }, [sessionId]);

  const advance = useCallback(
    async (res: AnswerResultDto) => {
      if (autoNextRef.current) {
        clearTimeout(autoNextRef.current);
        autoNextRef.current = null;
      }
      let hasNext =
        res.sessionStatus === "active" && idx + 1 < questionsRef.current.length;
      if (!hasNext && res.sessionStatus === "active" && mode === "challenge") {
        // dogrywka nie zdążyła — dociągnij i spróbuj jeszcze raz
        await extendQuestions();
        hasNext = idx + 1 < questionsRef.current.length;
      }
      if (!hasNext) {
        setPhase({ kind: "loading" });
        if (sessionId) void finish(sessionId);
        return;
      }
      setIdx((i) => i + 1);
      setSelected(null);
      setFeedback(null);
      setComment(null);
      // uzupełnij bufor wyzwania zawczasu (nie blokuje przejścia)
      if (mode === "challenge" && questionsRef.current.length - (idx + 2) < 4) {
        void extendQuestions();
      }
    },
    [idx, sessionId, finish, mode, extendQuestions],
  );

  async function answer(value: AnswerValue) {
    const question = questions[idx];
    if (!sessionId || !question || selected || busy) return;
    setSelected(value); // otwiera bottom-sheet w stanie „sprawdzam…”
    setBusy(true);
    try {
      const res = await api<AnswerResultDto>(
        `/api/quiz/sessions/${sessionId}/answers`,
        {
          method: "POST",
          body: JSON.stringify({ position: question.seq, answer: value }),
        },
      );
      // Komentarz narratora liczony lokalnie — serwer zwraca sam werdykt.
      const history = historyRef.current;
      let wrongStreak = 0;
      if (!res.correct) {
        wrongStreak = 1;
        for (let i = history.length - 1; i >= 0 && history[i] === false; i--) {
          wrongStreak += 1;
        }
      }
      const comeback =
        res.correct &&
        history.length >= 2 &&
        !history[history.length - 1] &&
        !history[history.length - 2];
      history.push(res.correct);
      setComment(
        pickComment(randomRng(), {
          correct: res.correct,
          timeMs: res.timeMs,
          combo: res.combo,
          wrongStreak,
          comeback,
        }),
      );
      setFeedback(res);
      setSessionXp((xp) => xp + res.xp);
      setScore(res.correctCount);
      // Wyzwanie: poprawna odpowiedź płynie dalej sama.
      if (mode === "challenge" && res.correct) {
        autoNextRef.current = setTimeout(() => void advance(res), 1000);
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

  // Zegar: limit czasu na pytanie; po upływie auto-oddanie {timeout:true}.
  // Reset odliczania przy zmianie pytania — wzorzec „adjust podczas renderu”.
  const [timerIdx, setTimerIdx] = useState(idx);
  if (timerIdx !== idx) {
    setTimerIdx(idx);
    setRemainingMs(limitMs);
  }
  const answerRef = useRef<(v: AnswerValue) => void>(() => {});
  useEffect(() => {
    answerRef.current = (v) => void answer(v);
  });
  const answered = selected !== null;
  useEffect(() => {
    if (phase.kind !== "playing" || answered) return;
    const deadline = Date.now() + limitMs;
    const t = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) {
        clearInterval(t);
        setRemainingMs(0);
        answerRef.current({ timeout: true });
      } else {
        setRemainingMs(left);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase.kind, idx, answered, limitMs]);

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
    // `po` (id zakończonej sesji) czyni link unikalnym — gwarantuje świeży
    // montaż gry (nową sesję) przy każdym „Jeszcze raz”.
    const againHref =
      mode === "learning"
        ? `/quiz/gra?mode=learning&categories=${(categories ?? ["mix"]).join(",")}&po=${sessionId ?? ""}`
        : mode === "challenge"
          ? `/quiz/gra?mode=challenge&po=${sessionId ?? ""}`
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

      {/* limit czasu na odpowiedź */}
      <div className="mt-3 flex items-center gap-2">
        <Progress
          value={remainingMs}
          max={limitMs}
          className="h-1.5 flex-1"
          barClassName={cn(
            "duration-100",
            remainingMs <= 5000 ? "bg-red-500" : "bg-dre-300",
          )}
        />
        <span
          className={cn(
            "w-8 shrink-0 text-right text-xs font-bold tabular-nums",
            remainingMs <= 5000 ? "text-red-600" : "text-gray-400",
          )}
        >
          {Math.ceil(remainingMs / 1000)}s
        </span>
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

      {/* Bottom-sheet feedbacku: otwiera się NATYCHMIAST po odpowiedzi
          („sprawdzam…”), werdykt wypełnia go po odpowiedzi serwera.
          „Dalej” zawsze pod kciukiem — zero scrollowania na telefonie. */}
      {selected && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <div className="w-full max-w-xl animate-slide-up rounded-t-3xl border-t border-gray-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
            {!feedback ? (
              <div className="flex items-center gap-3 py-3">
                <Spinner />
                <p className="font-semibold text-gray-500">Sprawdzam…</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={cn(
                      "text-lg font-black",
                      feedback.correct ? "text-green-700" : "text-red-700",
                    )}
                  >
                    {feedback.correct
                      ? "✓ Dobrze!"
                      : "timeout" in selected
                        ? "⏱ Czas minął"
                        : "✗ Niestety nie"}
                  </p>
                  {feedback.correct && (
                    <span className="shrink-0 rounded-full bg-green-600 px-2.5 py-1 text-sm font-bold text-white">
                      +{feedback.xp} XP
                    </span>
                  )}
                </div>
                {comment && (
                  <p className="mt-1 text-sm italic text-gray-500">„{comment}”</p>
                )}
                {feedback.explanation && (
                  <p className="mt-2 text-sm text-gray-600">{feedback.explanation}</p>
                )}
                {feedback.milestoneBonus > 0 && (
                  <p className="mt-2 text-sm font-semibold text-dre-600">
                    Kamień milowy! +{feedback.milestoneBonus} XP
                  </p>
                )}
                {mode === "challenge" && feedback.correct ? (
                  <p className="mt-3 text-center text-xs text-gray-400">
                    następne pytanie za chwilę…
                  </p>
                ) : (
                  <Button
                    onClick={() => void advance(feedback)}
                    className="mt-4 w-full"
                    size="lg"
                  >
                    {feedback.sessionStatus === "finished" ||
                    (mode !== "challenge" && idx + 1 >= questions.length)
                      ? "Zobacz wynik"
                      : "Dalej"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
