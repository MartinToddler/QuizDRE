-- QuizDRE 0003: sesje quizu, pytania sesji, transakcyjne funkcje gry.
-- Klient NIGDY nie czyta session_questions bezpośrednio (correct_answer!).
-- API (service role) woła: create_session → submit_answer → finish_session (0004).

-- ------------------------------------------------------------------
-- Quiz Dnia: identyczny zestaw dla wszystkich, generowany leniwie
-- (pierwsze żądanie dnia); unikat quiz_date czyni operację race-safe.
-- ------------------------------------------------------------------
create table public.daily_quiz (
  id uuid primary key default gen_random_uuid(),
  quiz_date date not null unique,
  questions jsonb not null, -- pełna specyfikacja Z odpowiedziami — tabela niedostępna dla klienta
  created_at timestamptz not null default now()
);

alter table public.daily_quiz enable row level security; -- brak polityk

-- ------------------------------------------------------------------
-- Sesje
-- ------------------------------------------------------------------
create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('learning', 'challenge', 'daily')),
  category text check (category in ('models', 'technical', 'left_right', 'theory', 'mix')),
  status text not null default 'active'
    check (status in ('active', 'finished', 'abandoned')),
  daily_quiz_id uuid references public.daily_quiz (id),
  question_count int not null default 0,
  correct_count int not null default 0,
  wrong_count int not null default 0,
  current_combo int not null default 0,
  max_combo int not null default 0,
  xp_earned int not null default 0,
  total_time_ms int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  finalized_at timestamptz,
  summary jsonb
);

-- Jedna aktywna sesja na użytkownika; jedno podejście do danego Quizu Dnia.
create unique index quiz_sessions_one_active
  on public.quiz_sessions (user_id) where (status = 'active');
create unique index quiz_sessions_one_daily
  on public.quiz_sessions (user_id, daily_quiz_id) where (daily_quiz_id is not null);
create index quiz_sessions_user_started
  on public.quiz_sessions (user_id, started_at desc);
create index quiz_sessions_daily_ranking
  on public.quiz_sessions (daily_quiz_id, correct_count desc, total_time_ms asc)
  where (daily_quiz_id is not null);

alter table public.quiz_sessions enable row level security;

create policy "quiz_sessions: odczyt własnych"
  on public.quiz_sessions for select to authenticated using (user_id = auth.uid());
-- zapisy tylko server-side

-- ------------------------------------------------------------------
-- Pytania sesji
-- ------------------------------------------------------------------
create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  seq int not null,
  qtype text not null check (qtype in ('feature_yn', 'left_right', 'model_guess', 'theory')),
  dedupe_key text not null,
  payload jsonb not null,        -- WYŁĄCZNIE to, co widzi klient
  correct_answer jsonb not null, -- nigdy nie serializowane przed odpowiedzią
  explanation text,
  image_path text,               -- prywatna ścieżka; API podmienia na signed URL
  served_at timestamptz,
  answered_at timestamptz,
  given_answer jsonb,
  is_correct boolean,
  time_ms int,
  xp int not null default 0,
  unique (session_id, seq),
  unique (session_id, dedupe_key)
);

create index session_questions_session on public.session_questions (session_id, seq);

alter table public.session_questions enable row level security; -- brak polityk

-- ------------------------------------------------------------------
-- create_session: transakcyjny start sesji.
-- Porzuca poprzednią aktywną sesję (wyzwanie: zachowuje rekord — patrz 0004,
-- best_challenge aktualizowany też przy finish; tu tylko domykamy status).
-- p_questions: [{seq, qtype, dedupeKey, payload, correctAnswer, explanation, imagePath}]
-- ------------------------------------------------------------------
create or replace function public.create_session(
  p_user_id uuid,
  p_mode text,
  p_category text,
  p_daily_quiz_id uuid,
  p_questions jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_session_id uuid;
  v_count int;
begin
  v_count := jsonb_array_length(p_questions);
  if v_count is null or v_count = 0 then
    raise exception 'no_questions';
  end if;

  -- Domknij poprzednią aktywną sesję (rage-quit bez korzyści: wynik zostaje).
  update public.quiz_sessions
     set status = 'abandoned', finished_at = now()
   where user_id = p_user_id and status = 'active';

  insert into public.quiz_sessions (user_id, mode, category, daily_quiz_id, question_count)
  values (p_user_id, p_mode, p_category, p_daily_quiz_id, v_count)
  returning id into v_session_id;

  insert into public.session_questions
    (session_id, seq, qtype, dedupe_key, payload, correct_answer, explanation, image_path)
  select
    v_session_id,
    (q->>'seq')::int,
    q->>'qtype',
    q->>'dedupeKey',
    q->'payload',
    q->'correctAnswer',
    q->>'explanation',
    q->>'imagePath'
  from jsonb_array_elements(p_questions) as q;

  return v_session_id;
end;
$$;

-- ------------------------------------------------------------------
-- append_questions: dogrywka partii w trybie wyzwania.
-- ------------------------------------------------------------------
create or replace function public.append_questions(
  p_user_id uuid,
  p_session_id uuid,
  p_questions jsonb
) returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_added int;
begin
  perform 1 from public.quiz_sessions
   where id = p_session_id and user_id = p_user_id and status = 'active'
   for update;
  if not found then
    raise exception 'session_not_active';
  end if;

  insert into public.session_questions
    (session_id, seq, qtype, dedupe_key, payload, correct_answer, explanation, image_path)
  select
    p_session_id,
    (q->>'seq')::int,
    q->>'qtype',
    q->>'dedupeKey',
    q->'payload',
    q->'correctAnswer',
    q->>'explanation',
    q->>'imagePath'
  from jsonb_array_elements(p_questions) as q
  on conflict (session_id, dedupe_key) do nothing;

  get diagnostics v_added = row_count;

  update public.quiz_sessions
     set question_count = question_count + v_added
   where id = p_session_id;

  return v_added;
end;
$$;

-- ------------------------------------------------------------------
-- submit_answer: walidacja + punktacja server-side, jedna transakcja.
-- Formuły XP MUSZĄ być zgodne z src/lib/engine/xp.ts.
-- ------------------------------------------------------------------
create or replace function public.submit_answer(
  p_user_id uuid,
  p_session_id uuid,
  p_seq int,
  p_answer jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_q public.session_questions%rowtype;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_time_ms int;
  v_correct boolean;
  v_combo int;
  v_xp int := 0;
  v_base int;
  v_speed int;
  v_xp_today int;
  v_milestone int := 0;
  v_status text;
begin
  select * into v_session
    from public.quiz_sessions
   where id = p_session_id and user_id = p_user_id
   for update;
  if not found then raise exception 'session_not_found'; end if;
  if v_session.status <> 'active' then raise exception 'session_not_active'; end if;

  select * into v_q
    from public.session_questions
   where session_id = p_session_id and seq = p_seq
   for update;
  if not found then raise exception 'question_not_found'; end if;
  if v_q.answered_at is not null then raise exception 'already_answered'; end if;
  if v_q.served_at is null then v_q.served_at := v_now; end if;

  v_time_ms := least(120000, greatest(0,
    (extract(epoch from (v_now - v_q.served_at)) * 1000)::int));
  if v_time_ms < 250 then raise exception 'too_fast'; end if;

  v_correct := (v_q.correct_answer = p_answer);
  v_combo := case when v_correct then v_session.current_combo + 1 else 0 end;

  if v_correct then
    v_base := case when v_session.mode = 'daily' then 15 else 10 end;
    v_speed := case
      when v_time_ms < 1000 then 0
      when v_time_ms <= 5000 then 5
      when v_time_ms <= 10000 then 3
      when v_time_ms <= 20000 then 1
      else 0
    end;
    v_xp := v_base + v_speed + greatest(0, least(v_combo - 1, 10));

    select coalesce(sum(amount), 0) into v_xp_today
      from public.xp_events
     where user_id = p_user_id and day_warsaw = v_today and kind = 'answer';
    if v_xp_today > 500 then
      v_xp := ceil(v_xp / 2.0);
    end if;
  end if;

  update public.session_questions
     set answered_at = v_now,
         served_at = coalesce(served_at, v_now),
         given_answer = p_answer,
         is_correct = v_correct,
         time_ms = v_time_ms,
         xp = v_xp
   where id = v_q.id;

  update public.quiz_sessions
     set correct_count = correct_count + (v_correct::int),
         wrong_count = wrong_count + ((not v_correct)::int),
         current_combo = v_combo,
         max_combo = greatest(max_combo, v_combo),
         xp_earned = xp_earned + v_xp,
         total_time_ms = total_time_ms + v_time_ms
   where id = p_session_id;

  if v_xp > 0 then
    insert into public.xp_events
      (user_id, amount, kind, session_id, session_question_id, day_warsaw)
    values (p_user_id, v_xp, 'answer', p_session_id, v_q.id, v_today);
  end if;

  insert into public.user_stats (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_stats
     set total_xp = total_xp + v_xp,
         questions_answered = questions_answered + 1,
         correct_answers = correct_answers + (v_correct::int),
         category_stats = jsonb_set(
           category_stats,
           array[v_q.qtype],
           jsonb_build_object(
             'total',
             coalesce((category_stats -> v_q.qtype ->> 'total')::int, 0) + 1,
             'correct',
             coalesce((category_stats -> v_q.qtype ->> 'correct')::int, 0) + (v_correct::int)
           )
         ),
         updated_at = now()
   where user_id = p_user_id;

  v_status := 'active';
  if v_session.mode = 'challenge' then
    if not v_correct then
      v_status := 'finished';
      update public.quiz_sessions
         set status = 'finished', finished_at = v_now
       where id = p_session_id;
    elsif (v_session.correct_count + 1) % 10 = 0 then
      -- kamień milowy wyzwania: co 10 poprawnych +15 XP
      v_milestone := 15;
      insert into public.xp_events (user_id, amount, kind, session_id, day_warsaw)
      values (p_user_id, 15, 'session_bonus', p_session_id, v_today);
      update public.quiz_sessions
         set xp_earned = xp_earned + 15 where id = p_session_id;
      update public.user_stats
         set total_xp = total_xp + 15, updated_at = now()
       where user_id = p_user_id;
    end if;
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'correctAnswer', v_q.correct_answer,
    'explanation', v_q.explanation,
    'timeMs', v_time_ms,
    'xp', v_xp + v_milestone,
    'combo', v_combo,
    'milestoneBonus', v_milestone,
    'sessionStatus', v_status,
    'correctCount', v_session.correct_count + (v_correct::int),
    'answeredCount', v_session.correct_count + v_session.wrong_count + 1
  );
end;
$$;

-- mark_question_served: ustawia served_at przy serwowaniu pytania (pomiar czasu).
create or replace function public.mark_question_served(
  p_user_id uuid,
  p_session_id uuid,
  p_seq int
) returns void
language sql security definer set search_path = public
as $$
  update public.session_questions sq
     set served_at = now()
    from public.quiz_sessions s
   where sq.session_id = p_session_id
     and sq.seq = p_seq
     and sq.served_at is null
     and s.id = sq.session_id
     and s.user_id = p_user_id
     and s.status = 'active';
$$;

-- Funkcje gry wyłącznie dla service role.
revoke execute on function
  public.create_session(uuid, text, text, uuid, jsonb),
  public.append_questions(uuid, uuid, jsonb),
  public.submit_answer(uuid, uuid, int, jsonb),
  public.mark_question_served(uuid, uuid, int)
from public, anon, authenticated;
