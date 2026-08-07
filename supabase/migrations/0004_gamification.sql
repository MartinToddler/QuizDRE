-- QuizDRE 0004: grywalizacja — XP, statystyki, odznaki, misje, rankingi.
-- xp_events to ŹRÓDŁO PRAWDY rankingów; user_stats.total_xp to cache
-- aktualizowany w tych samych transakcjach.

-- ------------------------------------------------------------------
-- Statystyki użytkownika
-- ------------------------------------------------------------------
create table public.user_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  total_xp int not null default 0,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  streak_freezes smallint not null default 0,
  sessions_completed int not null default 0,
  questions_answered int not null default 0,
  correct_answers int not null default 0,
  best_challenge_score int not null default 0,
  daily_quizzes_completed int not null default 0,
  category_stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_stats enable row level security;

create policy "user_stats: odczyt własnych"
  on public.user_stats for select to authenticated using (user_id = auth.uid());

-- Wiersz statystyk od razu przy rejestracji.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, 'user'), '@', 1))
  on conflict (id) do nothing;
  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- Zdarzenia XP
-- ------------------------------------------------------------------
create table public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null,
  kind text not null check (kind in
    ('answer', 'session_bonus', 'streak_bonus', 'badge', 'daily_quiz', 'mission')),
  session_id uuid references public.quiz_sessions (id) on delete set null,
  session_question_id uuid unique references public.session_questions (id) on delete set null,
  day_warsaw date not null default ((now() at time zone 'Europe/Warsaw')::date),
  awarded_at timestamptz not null default now()
);

create index xp_events_day_user on public.xp_events (day_warsaw, user_id) include (amount);
create index xp_events_user_time on public.xp_events (user_id, awarded_at desc);

alter table public.xp_events enable row level security;

create policy "xp_events: odczyt własnych"
  on public.xp_events for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------
-- Odznaki (deklaratywne kryteria: {"metric": "...", "gte": N})
-- ------------------------------------------------------------------
create table public.badges (
  id text primary key,
  name text not null,
  description text not null,
  icon text not null default '🏅',
  criteria jsonb not null,
  xp_reward int not null default 0,
  sort_order int not null default 100,
  active boolean not null default true
);

alter table public.badges enable row level security;

create policy "badges: odczyt dla zalogowanych"
  on public.badges for select to authenticated using (true);

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null references public.badges (id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;

create policy "user_badges: odczyt własnych"
  on public.user_badges for select to authenticated using (user_id = auth.uid());

insert into public.badges (id, name, description, icon, criteria, xp_reward, sort_order) values
  ('first_session',  'Pierwsze Drzwi',    'Ukończ pierwszy quiz.',                          '🚪', '{"metric":"sessions_completed","gte":1}',   10, 10),
  ('streak_3',       'Trzy Dni z Rzędu',  'Utrzymaj serię 3 dni.',                          '🔥', '{"metric":"streak","gte":3}',               15, 20),
  ('streak_7',       'Tydzień z DRE',     'Utrzymaj serię 7 dni.',                          '🔥', '{"metric":"streak","gte":7}',               30, 21),
  ('streak_30',      'Pełny Miesiąc',     'Utrzymaj serię 30 dni.',                         '🔥', '{"metric":"streak","gte":30}',             100, 22),
  ('streak_100',     'Nie do Zatrzymania','Utrzymaj serię 100 dni.',                        '🏆', '{"metric":"streak","gte":100}',            300, 23),
  ('correct_100',    'Setka',             '100 poprawnych odpowiedzi.',                     '✅', '{"metric":"total_correct","gte":100}',      20, 30),
  ('correct_500',    'Pięćsetka',         '500 poprawnych odpowiedzi.',                     '✅', '{"metric":"total_correct","gte":500}',      50, 31),
  ('correct_2500',   'Ludzka Encyklopedia','2500 poprawnych odpowiedzi.',                   '📚', '{"metric":"total_correct","gte":2500}',    150, 32),
  ('perfect_20',     'Perfekcjonista',    'Sesja nauki 20/20.',                             '�z', '{"metric":"perfect_session","gte":1}',      40, 40),
  ('challenge_10',   'Rozgrzewka',        '10 z rzędu w wyzwaniu.',                         '⚡', '{"metric":"challenge_score","gte":10}',     20, 50),
  ('challenge_25',   'Maratończyk',       '25 z rzędu w wyzwaniu.',                         '⚡', '{"metric":"challenge_score","gte":25}',     60, 51),
  ('challenge_50',   'Człowiek Katalog',  '50 z rzędu w wyzwaniu.',                         '👑', '{"metric":"challenge_score","gte":50}',    150, 52),
  ('lr_50',          'Sokole Oko',        '50 poprawnych „prawe/lewe”.',                    '👁', '{"metric":"lr_correct","gte":50}',          40, 60),
  ('tech_50',        'Inżynier',          '50 poprawnych o rozwiązaniach technicznych.',    '🔧', '{"metric":"technical_correct","gte":50}',   40, 61),
  ('models_50',      'Znawca Katalogu',   '50 poprawnych „jaki to model”.',                 '🚪', '{"metric":"models_correct","gte":50}',      40, 62),
  ('theory_50',      'Teoretyk',          '50 poprawnych z teorii.',                        '🎓', '{"metric":"theory_correct","gte":50}',      40, 63),
  ('daily_5',        'Bywalec',           'Ukończ 5 Quizów Dnia.',                          '📅', '{"metric":"daily_quizzes","gte":5}',        25, 70),
  ('daily_20',       'Stały Klient',      'Ukończ 20 Quizów Dnia.',                         '📅', '{"metric":"daily_quizzes","gte":20}',       80, 71),
  ('early_bird',     'Ranny Ptaszek',     'Ukończ quiz przed 7:00.',                        '🌅', '{"metric":"early_bird","gte":1}',           15, 80),
  ('night_owl',      'Nocna Zmiana',      'Ukończ quiz po 22:00.',                          '🌙', '{"metric":"night_owl","gte":1}',            15, 81);

update public.badges set icon = '💎' where id = 'perfect_20';

-- ------------------------------------------------------------------
-- Misje dzienne (MVP: stały zestaw 3 misji, auto-przyznanie przy finish)
-- ------------------------------------------------------------------
create table public.mission_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day_warsaw date not null,
  mission_code text not null,
  reward int not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, day_warsaw, mission_code)
);

alter table public.mission_completions enable row level security;

create policy "mission_completions: odczyt własnych"
  on public.mission_completions for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------
-- Rangi: indeks rangi dla XP (nazwy w src/lib/engine/xp.ts — MUSI być zgodne)
-- ------------------------------------------------------------------
create or replace function public.rank_index(p_xp int)
returns int
language sql immutable
as $$
  select case
    when p_xp >= 15000 then 9
    when p_xp >= 10000 then 8
    when p_xp >= 6500 then 7
    when p_xp >= 4000 then 6
    when p_xp >= 2500 then 5
    when p_xp >= 1500 then 4
    when p_xp >= 800 then 3
    when p_xp >= 400 then 2
    when p_xp >= 150 then 1
    else 0
  end;
$$;

-- ------------------------------------------------------------------
-- finish_session: bonusy, streak, odznaki, misje, rank-up — transakcyjnie.
-- Idempotentne: ponowne wywołanie zwraca zapisane summary.
-- ------------------------------------------------------------------
create or replace function public.finish_session(
  p_user_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_stats public.user_stats%rowtype;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_hour_warsaw int := extract(hour from (now() at time zone 'Europe/Warsaw'))::int;
  v_answered int;
  v_completed boolean;
  v_perfect boolean := false;
  v_bonus_learning int := 0;
  v_bonus_perfect int := 0;
  v_bonus_daily int := 0;
  v_bonus_total int := 0;
  v_is_record boolean := false;
  v_rank_before int;
  v_rank_after int;
  v_streak_first_today boolean := false;
  v_streak_used_freeze boolean := false;
  v_streak_earned_freeze boolean := false;
  v_streak_bonus int := 0;
  v_new_streak int;
  v_new_freezes int;
  v_gap int;
  v_badge record;
  v_metric int;
  v_new_badges jsonb := '[]'::jsonb;
  v_missions jsonb := '[]'::jsonb;
  v_answered_today int;
  v_mission record;
  v_summary jsonb;
begin
  select * into v_session
    from public.quiz_sessions
   where id = p_session_id and user_id = p_user_id
   for update;
  if not found then raise exception 'session_not_found'; end if;
  if v_session.finalized_at is not null then return v_session.summary; end if;

  v_answered := v_session.correct_count + v_session.wrong_count;

  if v_session.status = 'active' then
    update public.quiz_sessions
       set status = 'finished', finished_at = v_now
     where id = p_session_id;
    v_session.status := 'finished';
  end if;

  insert into public.user_stats (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select * into v_stats from public.user_stats where user_id = p_user_id for update;

  v_rank_before := public.rank_index(v_stats.total_xp);
  v_completed := v_answered >= v_session.question_count and v_session.question_count > 0;

  -- Bonusy sesyjne (formuły zgodne z src/lib/engine/xp.ts)
  if v_session.mode = 'learning' and v_completed then
    v_bonus_learning := 20;
    v_perfect := v_session.correct_count = v_session.question_count
                 and v_session.question_count >= 20;
    if v_perfect then v_bonus_perfect := 30; end if;
  elsif v_session.mode = 'daily' and v_completed then
    v_bonus_daily := 25;
  end if;

  v_bonus_total := v_bonus_learning + v_bonus_perfect + v_bonus_daily;

  if v_bonus_learning + v_bonus_perfect > 0 then
    insert into public.xp_events (user_id, amount, kind, session_id, day_warsaw)
    values (p_user_id, v_bonus_learning + v_bonus_perfect, 'session_bonus',
            p_session_id, v_today);
  end if;
  if v_bonus_daily > 0 then
    insert into public.xp_events (user_id, amount, kind, session_id, day_warsaw)
    values (p_user_id, v_bonus_daily, 'daily_quiz', p_session_id, v_today);
  end if;

  -- Rekord wyzwania
  if v_session.mode = 'challenge'
     and v_session.correct_count > v_stats.best_challenge_score then
    v_is_record := true;
    v_stats.best_challenge_score := v_session.correct_count;
  end if;

  -- Streak: dzień aktywny = ukończona sesja z >= 5 odpowiedziami.
  v_new_streak := v_stats.current_streak;
  v_new_freezes := v_stats.streak_freezes;
  if v_answered >= 5 and (v_stats.last_active_date is distinct from v_today) then
    v_streak_first_today := true;
    if v_stats.last_active_date is null then
      v_new_streak := 1;
    else
      v_gap := v_today - v_stats.last_active_date;
      if v_gap = 1 then
        v_new_streak := v_stats.current_streak + 1;
      elsif v_gap = 2 and v_stats.streak_freezes > 0 then
        v_new_freezes := v_stats.streak_freezes - 1;
        v_streak_used_freeze := true;
        v_new_streak := v_stats.current_streak + 1;
      else
        v_new_streak := 1;
      end if;
    end if;

    if v_new_streak % 7 = 0 and v_new_freezes < 2 then
      v_new_freezes := v_new_freezes + 1;
      v_streak_earned_freeze := true;
    end if;

    v_streak_bonus := 5 * least(v_new_streak, 10);
    insert into public.xp_events (user_id, amount, kind, session_id, day_warsaw)
    values (p_user_id, v_streak_bonus, 'streak_bonus', p_session_id, v_today);
    v_bonus_total := v_bonus_total + v_streak_bonus;

    update public.user_stats
       set current_streak = v_new_streak,
           longest_streak = greatest(longest_streak, v_new_streak),
           streak_freezes = v_new_freezes,
           last_active_date = v_today
     where user_id = p_user_id;
  end if;

  update public.user_stats
     set total_xp = total_xp + v_bonus_total,
         sessions_completed = sessions_completed + 1,
         best_challenge_score = greatest(best_challenge_score, v_stats.best_challenge_score),
         daily_quizzes_completed = daily_quizzes_completed
           + (case when v_session.mode = 'daily' and v_completed then 1 else 0 end),
         updated_at = v_now
   where user_id = p_user_id;

  update public.quiz_sessions
     set xp_earned = xp_earned + v_bonus_total
   where id = p_session_id;

  -- Misje dzienne (MVP: stały zestaw; unikat PK czyni przyznanie idempotentnym)
  select count(*) into v_answered_today
    from public.session_questions sq
    join public.quiz_sessions s on s.id = sq.session_id
   where s.user_id = p_user_id
     and sq.answered_at is not null
     and (sq.answered_at at time zone 'Europe/Warsaw')::date = v_today;

  for v_mission in
    select * from (values
      ('daily_goal_20', 'Cel dzienny: 20 pytań', 15,
        v_answered_today >= 20),
      ('combo_8', 'Combo x8 w jednej sesji', 10,
        greatest(v_session.max_combo, 0) >= 8),
      ('daily_quiz_done', 'Ukończ Quiz Dnia', 10,
        v_session.mode = 'daily' and v_completed)
    ) as m(code, title, reward, fulfilled)
  loop
    if v_mission.fulfilled then
      begin
        insert into public.mission_completions (user_id, day_warsaw, mission_code, reward)
        values (p_user_id, v_today, v_mission.code, v_mission.reward);
        -- XP misji to osiągnięcie użytkownika (bez session_id — nie wlicza się
        -- do xp_earned sesji; inwariant: xp_earned = suma eventów sesji).
        insert into public.xp_events (user_id, amount, kind, day_warsaw)
        values (p_user_id, v_mission.reward, 'mission', v_today);
        update public.user_stats
           set total_xp = total_xp + v_mission.reward, updated_at = v_now
         where user_id = p_user_id;
        v_missions := v_missions || jsonb_build_object(
          'code', v_mission.code, 'title', v_mission.title, 'reward', v_mission.reward);
      exception when unique_violation then
        null; -- misja zaliczona wcześniej dziś
      end;
    end if;
  end loop;

  -- Odznaki: ewaluacja na ŚWIEŻYCH statystykach
  select * into v_stats from public.user_stats where user_id = p_user_id;

  for v_badge in
    select b.* from public.badges b
    where b.active
      and not exists (
        select 1 from public.user_badges ub
        where ub.user_id = p_user_id and ub.badge_id = b.id
      )
  loop
    v_metric := case v_badge.criteria ->> 'metric'
      when 'sessions_completed' then v_stats.sessions_completed
      when 'streak' then v_stats.current_streak
      when 'total_correct' then v_stats.correct_answers
      when 'challenge_score' then v_stats.best_challenge_score
      when 'perfect_session' then (v_perfect)::int
      when 'lr_correct' then coalesce((v_stats.category_stats -> 'left_right' ->> 'correct')::int, 0)
      when 'technical_correct' then coalesce((v_stats.category_stats -> 'feature_yn' ->> 'correct')::int, 0)
      when 'models_correct' then coalesce((v_stats.category_stats -> 'model_guess' ->> 'correct')::int, 0)
      when 'theory_correct' then coalesce((v_stats.category_stats -> 'theory' ->> 'correct')::int, 0)
      when 'daily_quizzes' then v_stats.daily_quizzes_completed
      when 'early_bird' then (case when v_hour_warsaw < 7 then 1 else 0 end)
      when 'night_owl' then (case when v_hour_warsaw >= 22 then 1 else 0 end)
      else 0
    end;

    if v_metric >= (v_badge.criteria ->> 'gte')::int then
      insert into public.user_badges (user_id, badge_id)
      values (p_user_id, v_badge.id)
      on conflict do nothing;
      if found then
        if v_badge.xp_reward > 0 then
          -- jak przy misjach: XP odznaki bez session_id
          insert into public.xp_events (user_id, amount, kind, day_warsaw)
          values (p_user_id, v_badge.xp_reward, 'badge', v_today);
          update public.user_stats
             set total_xp = total_xp + v_badge.xp_reward, updated_at = v_now
           where user_id = p_user_id;
        end if;
        v_new_badges := v_new_badges || jsonb_build_object(
          'id', v_badge.id, 'name', v_badge.name, 'icon', v_badge.icon,
          'description', v_badge.description, 'xpReward', v_badge.xp_reward);
      end if;
    end if;
  end loop;

  select * into v_stats from public.user_stats where user_id = p_user_id;
  v_rank_after := public.rank_index(v_stats.total_xp);

  select * into v_session from public.quiz_sessions where id = p_session_id;

  v_summary := jsonb_build_object(
    'mode', v_session.mode,
    'answered', v_answered,
    'correct', v_session.correct_count,
    'total', v_session.question_count,
    'maxCombo', v_session.max_combo,
    'xpSession', v_session.xp_earned,
    'perfect', v_perfect,
    'bonuses', jsonb_build_object(
      'learning', v_bonus_learning,
      'perfect', v_bonus_perfect,
      'daily', v_bonus_daily,
      'streak', v_streak_bonus),
    'streak', jsonb_build_object(
      'current', v_stats.current_streak,
      'longest', v_stats.longest_streak,
      'freezes', v_stats.streak_freezes,
      'firstToday', v_streak_first_today,
      'usedFreeze', v_streak_used_freeze,
      'earnedFreeze', v_streak_earned_freeze),
    'newBadges', v_new_badges,
    'missions', v_missions,
    'rankBefore', v_rank_before,
    'rankAfter', v_rank_after,
    'totalXp', v_stats.total_xp,
    'isChallengeRecord', v_is_record,
    'bestChallenge', v_stats.best_challenge_score
  );

  update public.quiz_sessions
     set finalized_at = v_now, summary = v_summary
   where id = p_session_id;

  return v_summary;
end;
$$;

revoke execute on function public.finish_session(uuid, uuid)
from public, anon, authenticated;

-- ------------------------------------------------------------------
-- Rankingi (SECURITY DEFINER — czytają xp_events/profiles bez otwierania tabel)
-- ------------------------------------------------------------------
create or replace function public.get_leaderboard(
  p_period text,
  p_limit int default 50
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_start date;
  v_top jsonb;
  v_me jsonb;
begin
  if p_period not in ('daily', 'monthly', 'alltime') then
    raise exception 'bad_period';
  end if;
  v_start := case p_period
    when 'daily' then v_today
    when 'monthly' then date_trunc('month', v_today)::date
    else null
  end;

  with scores as (
    select user_id, xp from (
      select us.user_id, us.total_xp as xp
        from public.user_stats us
       where p_period = 'alltime'
      union all
      select e.user_id, sum(e.amount)::int as xp
        from public.xp_events e
       where p_period <> 'alltime' and e.day_warsaw >= v_start
       group by e.user_id
    ) s
    where xp > 0
  ),
  ranked as (
    select s.user_id, s.xp,
           rank() over (order by s.xp desc) as rnk
      from scores s
  ),
  enriched as (
    select r.rnk, r.xp, p.display_name,
           c.name as company_name, r.user_id
      from ranked r
      join public.profiles p on p.id = r.user_id
      left join public.companies c on c.id = p.company_id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank', e.rnk, 'name', e.display_name, 'company', e.company_name,
      'xp', e.xp, 'isMe', e.user_id = auth.uid())
      order by e.rnk, e.display_name) filter (where e.rnk <= p_limit), '[]'::jsonb),
    (select jsonb_build_object('rank', e2.rnk, 'xp', e2.xp)
       from enriched e2 where e2.user_id = auth.uid())
  into v_top, v_me
  from enriched e;

  return jsonb_build_object('period', p_period, 'top', v_top, 'me', v_me);
end;
$$;

create or replace function public.get_company_leaderboard()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_start date := date_trunc('month', v_today)::date;
  v_result jsonb;
begin
  with company_scores as (
    select p.company_id,
           sum(e.amount)::int as total_xp,
           count(distinct e.user_id)::int as users
      from public.xp_events e
      join public.profiles p on p.id = e.user_id
     where e.day_warsaw >= v_start and p.company_id is not null
     group by p.company_id
    having count(distinct e.user_id) >= 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', rnk, 'name', c.name, 'users', s.users,
      'totalXp', s.total_xp, 'avgXp', (s.total_xp / s.users))
      order by rnk), '[]'::jsonb)
    into v_result
    from (
      select cs.*, rank() over (order by cs.total_xp::numeric / cs.users desc) as rnk
        from company_scores cs
    ) s
    join public.companies c on c.id = s.company_id;

  return jsonb_build_object('month', to_char(v_start, 'YYYY-MM'), 'top', v_result);
end;
$$;

create or replace function public.get_challenge_leaderboard(p_limit int default 50)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_top jsonb;
  v_me jsonb;
begin
  with ranked as (
    select us.user_id, us.best_challenge_score as score,
           rank() over (order by us.best_challenge_score desc) as rnk
      from public.user_stats us
     where us.best_challenge_score > 0
  ),
  enriched as (
    select r.*, p.display_name, c.name as company_name
      from ranked r
      join public.profiles p on p.id = r.user_id
      left join public.companies c on c.id = p.company_id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'rank', e.rnk, 'name', e.display_name, 'company', e.company_name,
      'score', e.score, 'isMe', e.user_id = auth.uid())
      order by e.rnk, e.display_name) filter (where e.rnk <= p_limit), '[]'::jsonb),
    (select jsonb_build_object('rank', e2.rnk, 'score', e2.score)
       from enriched e2 where e2.user_id = auth.uid())
  into v_top, v_me
  from enriched e;

  return jsonb_build_object('top', v_top, 'me', v_me);
end;
$$;

grant execute on function
  public.get_leaderboard(text, int),
  public.get_company_leaderboard(),
  public.get_challenge_leaderboard(int)
to authenticated;
