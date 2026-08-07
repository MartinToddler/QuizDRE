import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "@/lib/env";

const PUBLIC_PATHS = ["/logowanie", "/rejestracja", "/auth"];

export async function middleware(request: NextRequest) {
  const config = supabasePublicConfig();
  if (!config) return NextResponse.next(); // brak konfiguracji → strona setup

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Odświeża sesję (wymagane przez @supabase/ssr) i daje nam usera.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // API pilnuje autoryzacji samodzielnie (401), bez redirectów HTML.
  if (path.startsWith("/api")) return response;

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isPublic && !path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // wszystko poza zasobami statycznymi
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
