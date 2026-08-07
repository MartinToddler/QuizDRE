-- QuizDRE 0006: prefetch pytań po stronie klienta.
-- Pytania (payloady bez odpowiedzi) trafiają do klienta z wyprzedzeniem,
-- a served_at ustawia lekki beacon przy WYŚWIETLENIU pytania.
-- Gdy odpowiedź wyprzedzi beacon (wyścig sieciowy), liczymy ją bez bonusu
-- za szybkość i bez kary too_fast — zamiast odrzucać (jak dotąd, gdy
-- served_at ustawiało się dopiero w momencie odpowiedzi).

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
  v_time_ms int; -- NULL = brak pomiaru (beacon nie zdążył)
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

  if v_q.served_at is null then
    v_time_ms := null; -- prefetch: brak pomiaru — bez bonusu i bez kary
  else
    v_time_ms := least(120000, greatest(0,
      (extract(epoch from (v_now - v_q.served_at)) * 1000)::int));
    if v_time_ms < 250 then raise exception 'too_fast'; end if;
  end if;

  v_correct := (v_q.correct_answer = p_answer);
  v_combo := case when v_correct then v_session.current_combo + 1 else 0 end;

  if v_correct then
    v_base := case when v_session.mode = 'daily' then 15 else 10 end;
    v_speed := case
      when v_time_ms is null then 0
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
         total_time_ms = total_time_ms + coalesce(v_time_ms, 0)
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
    'timeMs', coalesce(v_time_ms, 0),
    'xp', v_xp + v_milestone,
    'combo', v_combo,
    'milestoneBonus', v_milestone,
    'sessionStatus', v_status,
    'correctCount', v_session.correct_count + (v_correct::int),
    'answeredCount', v_session.correct_count + v_session.wrong_count + 1
  );
end;
$$;

revoke execute on function public.submit_answer(uuid, uuid, int, jsonb)
from public, anon, authenticated;
