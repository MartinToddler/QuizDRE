-- QuizDRE 0007: dekory.
-- Arkusz katalogu to w ~4/5 kolumny dekorów (kolorów) — rozdzielamy je od
-- techniki: nowa kategoria nauki 'dekory', próbki dekorów przy cechach
-- (features.image_path) i druga grafika pytania (session_questions.swatch_path;
-- pierwsza — image_path — to teraz także zdjęcie modelu w pytaniach o cechy).
-- Klasyfikację technika/dekor po features.category robi silnik TS
-- (src/lib/engine/types.ts: featureKind) — grupa „wycofane” poza pulą pytań.

alter table public.features
  add column if not exists image_path text;

alter table public.session_questions
  add column if not exists swatch_path text;

alter table public.quiz_sessions
  drop constraint if exists quiz_sessions_category_check;
alter table public.quiz_sessions
  add constraint quiz_sessions_category_check
  check (category in ('models', 'technical', 'dekory', 'left_right', 'theory', 'mix'));

-- ------------------------------------------------------------------
-- create_session / append_questions (z 0003) + przenoszenie swatchPath.
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
    (session_id, seq, qtype, dedupe_key, payload, correct_answer, explanation,
     image_path, swatch_path)
  select
    v_session_id,
    (q->>'seq')::int,
    q->>'qtype',
    q->>'dedupeKey',
    q->'payload',
    q->'correctAnswer',
    q->>'explanation',
    q->>'imagePath',
    q->>'swatchPath'
  from jsonb_array_elements(p_questions) as q;

  return v_session_id;
end;
$$;

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
    (session_id, seq, qtype, dedupe_key, payload, correct_answer, explanation,
     image_path, swatch_path)
  select
    p_session_id,
    (q->>'seq')::int,
    q->>'qtype',
    q->>'dedupeKey',
    q->'payload',
    q->'correctAnswer',
    q->>'explanation',
    q->>'imagePath',
    q->>'swatchPath'
  from jsonb_array_elements(p_questions) as q
  on conflict (session_id, dedupe_key) do nothing;

  get diagnostics v_added = row_count;

  update public.quiz_sessions
     set question_count = question_count + v_added
   where id = p_session_id;

  return v_added;
end;
$$;

revoke execute on function
  public.create_session(uuid, text, text, uuid, jsonb),
  public.append_questions(uuid, uuid, jsonb)
from public, anon, authenticated;
