import { Card } from "@/components/ui/card";
import { Logo } from "@/components/logo";

/** Ekran informacyjny, gdy brakuje zmiennych środowiskowych Supabase. */
export function SetupNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <Card className="max-w-lg">
        <Logo />
        <h1 className="mt-4 text-lg font-bold">Aplikacja nie jest jeszcze skonfigurowana</h1>
        <p className="mt-2 text-sm text-gray-600">
          Brakuje zmiennych środowiskowych Supabase. Ustaw w{" "}
          <code className="rounded bg-gray-100 px-1">.env.local</code> (lub w
          panelu Vercel):
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
          {`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...`}
        </pre>
        <p className="mt-3 text-sm text-gray-600">
          Pełna instrukcja: <code className="rounded bg-gray-100 px-1">README.md</code>.
        </p>
      </Card>
    </main>
  );
}
