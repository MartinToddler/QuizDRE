-- QuizDRE 0002: katalog — modele drzwi, cechy, macierz, pytania teoretyczne.
-- ŻADNA z tych tabel nie jest czytelna dla klienta (RLS bez polityk):
-- original_orientation i ścieżki zdjęć zdradzałyby odpowiedzi typu „prawe/lewe”,
-- a correct_index — odpowiedzi teorii. Dostęp wyłącznie server-side.

create table public.door_models (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  collection text,
  original_orientation text not null default 'right'
    check (original_orientation in ('left', 'right')),
  photo_original_path text,
  photo_mirrored_path text,
  eligible_left_right boolean not null default false,
  eligible_model_guess boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.features (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Jawne TAK i NIE z Excela; komórka niejednoznaczna = brak wiersza
-- (odróżniamy „nie ma cechy” od „nie wiadomo”).
create table public.model_features (
  model_id uuid not null references public.door_models (id) on delete cascade,
  feature_id uuid not null references public.features (id) on delete cascade,
  has_feature boolean not null,
  primary key (model_id, feature_id)
);

create table public.theory_questions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  category text not null default 'teoria',
  question text not null,
  answers jsonb not null,
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  active boolean not null default true,
  source text,
  created_at timestamptz not null default now(),
  constraint answers_is_array check (jsonb_typeof(answers) = 'array')
);

alter table public.door_models enable row level security;
alter table public.features enable row level security;
alter table public.model_features enable row level security;
alter table public.theory_questions enable row level security;
-- celowo BRAK polityk — dostęp tylko przez service role
