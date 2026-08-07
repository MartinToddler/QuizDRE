-- QuizDRE 0001: fundament — firmy, profile, trigger tworzący profil.
-- Konwencja bezpieczeństwa: RLS włączone wszędzie; brak polityki = brak dostępu.
-- Zapisy wyników wyłącznie server-side (service role / funkcje SECURITY DEFINER).

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- Firmy (ranking firm; użytkownik wybiera przy onboardingu)
-- ------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

create policy "companies: odczyt dla zalogowanych"
  on public.companies for select to authenticated using (true);

insert into public.companies (name) values ('DRE'), ('Inna firma');

-- ------------------------------------------------------------------
-- Profile użytkowników (1:1 z auth.users)
-- ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  company_id uuid references public.companies (id),
  preferred_reminder_hour smallint not null default 8
    check (preferred_reminder_hour between 0 and 23),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: odczyt własnego"
  on public.profiles for select to authenticated using (id = auth.uid());

create policy "profiles: edycja własnego"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Profil powstaje automatycznie przy rejestracji.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, 'user'), '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
