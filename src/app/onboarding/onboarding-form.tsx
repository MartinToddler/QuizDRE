"use client";

import { useActionState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { completeOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({
  defaultName,
  defaultHour,
  companies,
}: {
  defaultName: string;
  defaultHour: number;
  companies: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo />
          <h1 className="mt-3 text-lg font-bold">Jeszcze dwa kroki</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tak będziesz się pojawiać w rankingach.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="displayName">Nick</Label>
            <Input
              id="displayName"
              name="displayName"
              required
              minLength={2}
              maxLength={30}
              defaultValue={defaultName}
              placeholder="np. MistrzKlamki"
            />
          </div>
          <div>
            <Label htmlFor="companyId">Firma (opcjonalnie)</Label>
            <Select id="companyId" name="companyId" defaultValue="">
              <option value="">Bez firmy — wybiorę później</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-gray-400">
              Firmy rywalizują w osobnym rankingu (min. 3 aktywne osoby).
              Zmienisz to w każdej chwili w Ustawieniach.
            </p>
          </div>
          <div>
            <Label htmlFor="reminderHour">Godzina codziennego przypomnienia</Label>
            <Select id="reminderHour" name="reminderHour" defaultValue={String(defaultHour)}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Zapisywanie…" : "Zaczynamy"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
