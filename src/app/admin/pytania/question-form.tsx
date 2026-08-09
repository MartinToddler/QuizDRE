"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { QuestionFormState } from "./actions";

const LETTERS = ["A", "B", "C", "D"];

export interface QuestionFormValues {
  id?: string;
  question: string;
  answers: string[];
  correctIndex: number;
  explanation: string;
  category: string;
  difficulty: number;
  active: boolean;
}

export function QuestionForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: QuestionFormState, fd: FormData) => Promise<QuestionFormState>;
  defaults: QuestionFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<QuestionFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <div>
        <Label htmlFor="question">Treść pytania</Label>
        <Textarea
          id="question"
          name="question"
          required
          minLength={5}
          maxLength={500}
          defaultValue={defaults.question}
          placeholder="np. Która okleina jest najbardziej odporna na zarysowania?"
        />
      </div>

      <div>
        <Label>Odpowiedzi (zaznacz poprawną)</Label>
        <div className="space-y-2">
          {LETTERS.map((letter, i) => (
            <div key={letter} className="flex items-center gap-2">
              <input
                type="radio"
                name="correctIndex"
                value={i}
                defaultChecked={defaults.correctIndex === i}
                required
                aria-label={`Poprawna odpowiedź ${letter}`}
                className="size-5 shrink-0 accent-dre-500"
              />
              <span className="w-5 shrink-0 text-sm font-bold text-gray-500">
                {letter}
              </span>
              <Input
                name={`answer${i}`}
                required
                maxLength={200}
                defaultValue={defaults.answers[i] ?? ""}
                placeholder={`Odpowiedź ${letter}`}
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">
          W quizie kolejność odpowiedzi jest tasowana automatycznie.
        </p>
      </div>

      <div>
        <Label htmlFor="explanation">Wyjaśnienie (pokazywane po odpowiedzi)</Label>
        <Textarea
          id="explanation"
          name="explanation"
          maxLength={600}
          defaultValue={defaults.explanation}
          placeholder="Dlaczego ta odpowiedź jest poprawna (opcjonalnie)"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="category">Kategoria</Label>
          <Input
            id="category"
            name="category"
            maxLength={50}
            defaultValue={defaults.category}
            placeholder="teoria"
          />
        </div>
        <div>
          <Label htmlFor="difficulty">Trudność</Label>
          <Select
            id="difficulty"
            name="difficulty"
            defaultValue={String(defaults.difficulty)}
          >
            <option value="1">1 — łatwe</option>
            <option value="2">2 — średnie</option>
            <option value="3">3 — trudne</option>
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name="active"
          defaultChecked={defaults.active}
          className="size-4 accent-dre-500"
        />
        Aktywne (losuje się w quizach)
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Zapisywanie…" : submitLabel}
        </Button>
        <Link href="/admin/pytania">
          <Button type="button" variant="secondary">
            Anuluj
          </Button>
        </Link>
      </div>
    </form>
  );
}
