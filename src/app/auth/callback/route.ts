import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/server";

/** Wymiana kodu OAuth/e-mail na sesję (PKCE). */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/logowanie?blad=auth`);
}
