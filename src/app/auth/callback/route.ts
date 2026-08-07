import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/server";

/** Wymiana kodu OAuth/e-mail na sesję (PKCE). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const fail = (description: string | null) => {
    const url = new URL("/logowanie", origin);
    url.searchParams.set("blad", "auth");
    if (description) url.searchParams.set("opis", description.slice(0, 160));
    return NextResponse.redirect(url);
  };

  // Supabase może odesłać błąd zamiast kodu (np. odmowa zgody w Google).
  if (!code) {
    return fail(
      searchParams.get("error_description") ?? searchParams.get("error"),
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("Brak konfiguracji Supabase (zmienne środowiskowe).");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return NextResponse.redirect(
    `${origin}${next.startsWith("/") ? next : "/"}`,
  );
}
