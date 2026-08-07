"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "@/lib/env";

let cached: SupabaseClient | null = null;

/** Klient przeglądarkowy (singleton) — auth i odczyty pod RLS. */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const config = supabasePublicConfig();
  if (!config) return null;
  if (!cached) {
    cached = createBrowserClient(config.url, config.anonKey);
  }
  return cached;
}
