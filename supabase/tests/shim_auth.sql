-- Shim do testowania migracji na CZYSTYM PostgreSQL (bez Supabase).
-- Odtwarza minimum środowiska Supabase: role, schema auth, auth.uid().
-- NIE uruchamiać na prawdziwym projekcie Supabase.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- Supabase ustawia sub w claimach JWT; w testach podajemy go przez GUC.
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
