/**
 * Dostęp do zmiennych środowiskowych z łagodną degradacją:
 * bez skonfigurowanego Supabase aplikacja renderuje instrukcję konfiguracji
 * zamiast wybuchać w trakcie builda.
 */

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function supabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function supabaseServiceKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicConfig() !== null && supabaseServiceKey() !== null;
}

export const STORAGE_BUCKET = "door-photos";
export const SIGNED_URL_TTL_SECONDS = 600;
