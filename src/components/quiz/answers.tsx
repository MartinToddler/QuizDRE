"use client";

import { cn } from "@/lib/cn";
import type { AnswerValue, QuestionPayload } from "@/lib/engine";

const LETTERS = ["A", "B", "C", "D"];

function isSame(a: AnswerValue | null, b: AnswerValue): boolean {
  if (!a) return false;
  if ("value" in a && "value" in b) return a.value === b.value;
  if ("index" in a && "index" in b) return a.index === b.index;
  return false;
}

function buttonTone(
  answer: AnswerValue,
  selected: AnswerValue | null,
  correct: AnswerValue | null,
): "idle" | "correct" | "wrong" | "muted" {
  if (!correct) return "idle";
  if (isSame(correct, answer)) return "correct";
  if (isSame(selected, answer)) return "wrong";
  return "muted";
}

const TONE_CLASSES: Record<ReturnType<typeof buttonTone>, string> = {
  idle: "border-gray-200 bg-white hover:border-dre-400 hover:shadow-sm active:scale-[0.99]",
  correct: "border-green-500 bg-green-50 text-green-800",
  wrong: "border-red-400 bg-red-50 text-red-700 animate-shake",
  muted: "border-gray-200 bg-gray-50 text-gray-400",
};

/**
 * Przyciski odpowiedzi — wariant zależny od typu pytania.
 * Po odpowiedzi: poprawna na zielono, wybrana błędna na czerwono.
 */
export function AnswerGrid({
  payload,
  selected,
  correct,
  onAnswer,
}: {
  payload: QuestionPayload;
  selected: AnswerValue | null;
  correct: AnswerValue | null;
  onAnswer: (value: AnswerValue) => void;
}) {
  const disabled = correct !== null || selected !== null;

  if (payload.qtype === "feature_yn" || payload.qtype === "left_right") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {payload.options.map((opt) => {
          const value: AnswerValue = { value: opt };
          const tone = buttonTone(value, selected, correct);
          return (
            <button
              key={opt}
              disabled={disabled}
              onClick={() => onAnswer(value)}
              className={cn(
                "h-16 rounded-2xl border-2 text-lg font-bold transition-all",
                TONE_CLASSES[tone],
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      {payload.options.map((opt, i) => {
        const value: AnswerValue = { index: i };
        const tone = buttonTone(value, selected, correct);
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onAnswer(value)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all",
              TONE_CLASSES[tone],
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                tone === "correct"
                  ? "bg-green-500 text-white"
                  : tone === "wrong"
                    ? "bg-red-400 text-white"
                    : "bg-gray-100 text-gray-600",
              )}
            >
              {LETTERS[i]}
            </span>
            <span className="font-medium">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
