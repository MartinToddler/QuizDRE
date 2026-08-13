"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DAILY_QUIZ_SIZE_MAX, DAILY_QUIZ_SIZE_MIN } from "@/lib/engine";
import { saveDailyQuizSize, type SettingFormState } from "./actions";

export function DailySizeForm({ initial }: { initial: number }) {
  const [state, formAction, pending] = useActionState<SettingFormState, FormData>(
    saveDailyQuizSize,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="w-32">
        <Label htmlFor="size">Liczba pytań</Label>
        <Input
          id="size"
          name="size"
          type="number"
          required
          min={DAILY_QUIZ_SIZE_MIN}
          max={DAILY_QUIZ_SIZE_MAX}
          defaultValue={initial}
          className="tabular-nums"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Zapisywanie…" : "Zapisz"}
      </Button>
      <div className="basis-full">
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.saved && (
          <p className="text-sm text-green-600">
            Zapisano ✓ — nowa długość obowiązuje od jutrzejszego zestawu.
          </p>
        )}
      </div>
    </form>
  );
}
