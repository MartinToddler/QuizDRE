"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORY_INFO } from "@/components/quiz/categories";
import { DEFAULT_QUESTION_MIX, LEARNING_SESSION_SIZE, type QuestionMix } from "@/lib/engine";
import { saveQuestionMix, type MixFormState } from "./actions";

const ORDER: (keyof QuestionMix)[] = [
  "technical",
  "dekory",
  "models",
  "left_right",
  "theory",
];

export function MixForm({ initial }: { initial: QuestionMix }) {
  const [state, formAction, pending] = useActionState<MixFormState, FormData>(
    saveQuestionMix,
    {},
  );
  const [mix, setMix] = useState<QuestionMix>(initial);

  const total = ORDER.reduce((n, k) => n + mix[k], 0);
  const share = (k: keyof QuestionMix) => (total > 0 ? mix[k] / total : 0);
  const perSession = (k: keyof QuestionMix) =>
    Math.round(share(k) * LEARNING_SESSION_SIZE);

  return (
    <form action={formAction} className="space-y-5">
      {ORDER.map((key) => {
        const info = CATEGORY_INFO[key];
        return (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={key} className="font-semibold text-gray-800">
                {info.icon} {info.title}
              </label>
              <span className="text-sm text-gray-500">
                <span className="font-bold text-dre-600">
                  {Math.round(share(key) * 100)}%
                </span>{" "}
                · ~{perSession(key)} z {LEARNING_SESSION_SIZE} pytań
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id={key}
                name={key}
                type="range"
                min={0}
                max={100}
                step={5}
                value={mix[key]}
                onChange={(e) =>
                  setMix((m) => ({ ...m, [key]: Number(e.target.value) }))
                }
                className="h-2 flex-1 accent-dre-500"
              />
              <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums text-gray-700">
                {mix[key]}
              </span>
            </div>
          </div>
        );
      })}

      {total === 0 && (
        <p className="text-sm text-red-600">
          Przynajmniej jedna kategoria musi mieć wagę większą od zera.
        </p>
      )}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && (
        <p className="text-sm text-green-600">
          Zapisano ✓ — nowe sesje losują już według tych proporcji.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || total === 0}>
          {pending ? "Zapisywanie…" : "Zapisz proporcje"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setMix(DEFAULT_QUESTION_MIX)}
        >
          Przywróć domyślne
        </Button>
      </div>
    </form>
  );
}
