"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { updateSettings, type SettingsState } from "./actions";

export function SettingsForm({
  defaults,
  companies,
}: {
  defaults: { displayName: string; companyId: string; reminderHour: number };
  companies: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateSettings,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="displayName">Nick</Label>
        <Input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={30}
          defaultValue={defaults.displayName}
        />
      </div>
      <div>
        <Label htmlFor="companyId">Firma</Label>
        <Select id="companyId" name="companyId" defaultValue={defaults.companyId} required>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="reminderHour">Godzina porannego przypomnienia</Label>
        <Select id="reminderHour" name="reminderHour" defaultValue={String(defaults.reminderHour)}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </Select>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.saved && <p className="text-sm text-green-600">Zapisano ✓</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Zapisywanie…" : "Zapisz zmiany"}
      </Button>
    </form>
  );
}
