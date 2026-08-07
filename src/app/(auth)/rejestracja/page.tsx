"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/db/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const supabase = createSupabaseBrowserClient();

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setError("Hasło musi mieć co najmniej 8 znaków.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    if (error) {
      setError(
        error.message.includes("already registered")
          ? "Ten e-mail jest już zarejestrowany."
          : error.message,
      );
      setBusy(false);
      return;
    }
    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
    } else {
      // Projekt wymaga potwierdzenia e-mail
      setCheckEmail(true);
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <Card className="w-full max-w-sm text-center">
          <Logo />
          <h1 className="mt-4 text-lg font-bold">Sprawdź skrzynkę</h1>
          <p className="mt-2 text-sm text-gray-600">
            Wysłaliśmy link potwierdzający na <strong>{email}</strong>. Kliknij
            go, aby dokończyć rejestrację.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <Card className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo />
          <p className="mt-2 text-sm text-gray-500">Załóż konto i zacznij serię</p>
        </div>

        <form onSubmit={signUp} className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Hasło (min. 8 znaków)</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !supabase}>
            Zarejestruj się
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Masz już konto?{" "}
          <Link href="/logowanie" className="font-semibold text-dre-600 hover:underline">
            Zaloguj się
          </Link>
        </p>
      </Card>
    </main>
  );
}
