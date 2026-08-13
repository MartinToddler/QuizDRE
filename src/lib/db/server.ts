import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { supabasePublicConfig, supabaseServiceKey } from "@/lib/env";

/**
 * Klient związany z sesją użytkownika (cookies) — do odczytów pod RLS
 * i wywołań RPC rankingów (auth.uid() działa).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = supabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component nie może pisać cookies — odświeżanie sesji
          // realizuje middleware.
        }
      },
    },
  });
}

/**
 * Klient service role — omija RLS. WYŁĄCZNIE server-side: sesje quizu,
 * katalog (odpowiedzi!), signed URLs.
 */
export function createAdminClient(): SupabaseClient | null {
  const config = supabasePublicConfig();
  const serviceKey = supabaseServiceKey();
  if (!config || !serviceKey) return null;
  return createClient(config.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Zalogowany użytkownik albo null. `cache()` scala wywołania w obrębie
 * jednego żądania (strona + AppShell nie pytają Auth dwa razy).
 */
export const getSessionUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
