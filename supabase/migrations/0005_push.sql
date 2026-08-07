-- QuizDRE 0005: Web Push — subskrypcje i log powiadomień.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failed_count int not null default 0,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push: odczyt własnych"
  on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "push: dodawanie własnych"
  on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "push: usuwanie własnych"
  on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Max 1 powiadomienie danego typu dziennie (idempotencja crona).
create table public.notification_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('morning', 'streak_rescue')),
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, sent_on)
);

alter table public.notification_log enable row level security; -- brak polityk

-- Odbiorcy przypomnień — wołane przez Edge Function (service role).
create or replace function public.get_reminder_recipients(p_kind text)
returns table (
  user_id uuid,
  display_name text,
  current_streak int,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_hour int := extract(hour from (now() at time zone 'Europe/Warsaw'))::int;
begin
  if p_kind = 'morning' then
    return query
      select p.id, p.display_name, us.current_streak,
             ps.endpoint, ps.p256dh, ps.auth
        from public.profiles p
        join public.user_stats us on us.user_id = p.id
        join public.push_subscriptions ps on ps.user_id = p.id
       where p.preferred_reminder_hour = v_hour
         and (us.last_active_date is null or us.last_active_date < v_today)
         and not exists (
           select 1 from public.notification_log nl
           where nl.user_id = p.id and nl.kind = 'morning' and nl.sent_on = v_today
         );
  elsif p_kind = 'streak_rescue' then
    return query
      select p.id, p.display_name, us.current_streak,
             ps.endpoint, ps.p256dh, ps.auth
        from public.profiles p
        join public.user_stats us on us.user_id = p.id
        join public.push_subscriptions ps on ps.user_id = p.id
       where us.current_streak > 0
         and us.last_active_date = v_today - 1
         and not exists (
           select 1 from public.notification_log nl
           where nl.user_id = p.id and nl.kind = 'streak_rescue' and nl.sent_on = v_today
         );
  else
    raise exception 'bad_kind';
  end if;
end;
$$;

revoke execute on function public.get_reminder_recipients(text)
from public, anon, authenticated;
