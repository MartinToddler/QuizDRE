-- QuizDRE 0010: globalne ustawienia aplikacji (klucz → jsonb).
--
-- Pierwsze zastosowanie: `question_mix` — wagi kategorii pytań wspólne dla
-- WSZYSTKICH użytkowników (panel admina: /admin/proporcje). Wagi są
-- relatywne (0–100); 0 = kategoria wypada z mixu, wyzwania i Quizu Dnia.
-- Domyślne wartości w TS: DEFAULT_QUESTION_MIX (src/lib/engine/types.ts) —
-- kod działa bez tej tabeli (fallback), migracja włącza edycję z panelu.
--
-- Tabela dostępna WYŁĄCZNIE dla service role (RLS bez polityk): ustawienia
-- gry nie muszą trafiać do przeglądarki, a zapisywać może tylko serwer
-- po sprawdzeniu roli admina.

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

alter table public.app_settings enable row level security;
-- celowo BRAK polityk — dostęp tylko przez service role

insert into public.app_settings (key, value) values (
  'question_mix',
  '{"models": 20, "technical": 35, "dekory": 10, "left_right": 15, "theory": 20}'::jsonb
) on conflict (key) do nothing;
