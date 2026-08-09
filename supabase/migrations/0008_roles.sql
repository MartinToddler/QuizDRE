-- QuizDRE 0008: system ról (RBAC).
--
-- Rola „user” jest NIEJAWNA — ma ją każdy zalogowany, niczego nie zapisujemy.
-- user_roles przechowuje wyłącznie role podwyższone (dziś: admin).
-- Nowa rola w przyszłości = INSERT do słownika roles, bez zmiany schematu;
-- użytkownik może mieć wiele ról naraz.
--
-- Bezpieczeństwo: zapisy do user_roles TYLKO przez service role (RLS bez
-- polityk zapisu — jak katalog pytań), więc nikt nie nada sobie roli sam.
-- Serwer sprawdza role świeżym odczytem z bazy (nie z JWT — odebranie roli
-- działa natychmiast). has_role() służy przyszłym politykom RLS tabel
-- panelu admina (obrona w głębi).

create table public.roles (
  name text primary key,
  description text
);

insert into public.roles (name, description) values
  ('admin', 'Dostęp do panelu administracyjnego (zarządzanie treścią i użytkownikami).');

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null references public.roles (name) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id),
  primary key (user_id, role)
);

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

-- Słownik ról jest jawny (nazwy ról nie są tajne).
create policy "roles: odczyt dla zalogowanych"
  on public.roles for select to authenticated using (true);

-- Własne role widoczne (UI może pokazać link do panelu); zapisy — brak
-- polityk, wyłącznie service role.
create policy "user_roles: odczyt własnych"
  on public.user_roles for select to authenticated using (user_id = auth.uid());

-- Pod polityki RLS przyszłych tabel panelu admina:
--   using (public.has_role('admin'))
create or replace function public.has_role(p_role text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid() and role = p_role
  );
$$;

revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;
