-- Test dymny QuizDRE: pełny przepływ gry na lokalnym PostgreSQL.
-- Uruchamiany przez scripts/db-test.sh po zaaplikowaniu migracji.
\set ON_ERROR_STOP on

-- ------------------------------------------------------------------
-- 1. Rejestracja: trigger tworzy profil + statystyki
-- ------------------------------------------------------------------
insert into auth.users (email) values ('tester@dre.pl') returning id as uid
\gset
select set_config('test.uid', :'uid', false);

do $$
declare v_uid uuid := current_setting('test.uid')::uuid;
begin
  assert (select count(*) from public.profiles where id = v_uid) = 1,
    'trigger nie utworzył profilu';
  assert (select count(*) from public.user_stats where user_id = v_uid) = 1,
    'trigger nie utworzył user_stats';
  assert (select display_name from public.profiles where id = v_uid) = 'tester',
    'display_name z emaila';
end $$;

-- ------------------------------------------------------------------
-- 2. Seed katalogu
-- ------------------------------------------------------------------
insert into public.door_models (name, collection, original_orientation,
  photo_original_path, photo_mirrored_path, eligible_left_right)
values
  ('Nova 01', 'Nova', 'right', 'p/n1a.jpg', 'p/n1b.jpg', true),
  ('Nova 02', 'Nova', 'right', 'p/n2a.jpg', 'p/n2b.jpg', true),
  ('Deco 01', 'Deco', 'right', 'p/d1a.jpg', 'p/d1b.jpg', true),
  ('Deco 02', 'Deco', 'right', 'p/d2a.jpg', 'p/d2b.jpg', true);

insert into public.features (name) values ('Szyba hartowana'), ('Podcięcie wentylacyjne');

insert into public.model_features (model_id, feature_id, has_feature)
select m.id, f.id, (m.name = 'Nova 01')
from public.door_models m cross join public.features f;

insert into public.theory_questions (external_id, question, answers, correct_index, explanation)
values
  ('t1', 'Pytanie 1?', '["A","B","C","D"]'::jsonb, 0, 'Bo A.'),
  ('t2', 'Pytanie 2?', '["A","B","C","D"]'::jsonb, 1, 'Bo B.');

-- ------------------------------------------------------------------
-- 3. Sesja nauki: create_session + odpowiedzi
-- ------------------------------------------------------------------
select public.create_session(
  current_setting('test.uid')::uuid,
  'learning', 'mix', null,
  '[
    {"seq":1,"qtype":"feature_yn","dedupeKey":"k1","payload":{"q":1},"correctAnswer":{"value":"TAK"},"explanation":"e1","imagePath":null},
    {"seq":2,"qtype":"feature_yn","dedupeKey":"k2","payload":{"q":2},"correctAnswer":{"value":"NIE"},"explanation":"e2","imagePath":null},
    {"seq":3,"qtype":"left_right","dedupeKey":"k3","payload":{"q":3},"correctAnswer":{"value":"LEWE"},"explanation":"e3","imagePath":"p/n1b.jpg"},
    {"seq":4,"qtype":"model_guess","dedupeKey":"k4","payload":{"q":4},"correctAnswer":{"index":2},"explanation":"e4","imagePath":"p/n1a.jpg"},
    {"seq":5,"qtype":"theory","dedupeKey":"k5","payload":{"q":5},"correctAnswer":{"index":0},"explanation":"e5","imagePath":null},
    {"seq":6,"qtype":"theory","dedupeKey":"k6","payload":{"q":6},"correctAnswer":{"index":1},"explanation":"e6","imagePath":null}
  ]'::jsonb
) as sid
\gset
select set_config('test.sid', :'sid', false);

do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_sid uuid := current_setting('test.sid')::uuid;
  v_res jsonb;
begin
  assert (select question_count from public.quiz_sessions where id = v_sid) = 6;
  assert (select count(*) from public.session_questions where session_id = v_sid) = 6;

  -- pytanie 1: serwowane 3 s temu → poprawna odpowiedź z bonusem szybkości
  perform public.mark_question_served(v_uid, v_sid, 1);
  update public.session_questions
     set served_at = now() - interval '3 seconds'
   where session_id = v_sid and seq = 1;

  v_res := public.submit_answer(v_uid, v_sid, 1, '{"value":"TAK"}'::jsonb);
  assert (v_res->>'correct')::boolean, 'odpowiedź 1 miała być poprawna';
  assert (v_res->>'xp')::int = 15, format('xp=15 (baza10+szybkość5), było %s', v_res->>'xp');
  assert (v_res->>'combo')::int = 1;

  -- podwójna odpowiedź na to samo pytanie → wyjątek
  begin
    perform public.submit_answer(v_uid, v_sid, 1, '{"value":"TAK"}'::jsonb);
    raise exception 'oczekiwano already_answered';
  exception when others then
    if sqlerrm <> 'already_answered' then raise; end if;
  end;

  -- zbyt szybka odpowiedź → too_fast
  perform public.mark_question_served(v_uid, v_sid, 2);
  begin
    perform public.submit_answer(v_uid, v_sid, 2, '{"value":"NIE"}'::jsonb);
    raise exception 'oczekiwano too_fast';
  exception when others then
    if sqlerrm <> 'too_fast' then raise; end if;
  end;

  -- pytanie 2: poprawnie (combo 2 → +1)
  update public.session_questions set served_at = now() - interval '3 seconds'
   where session_id = v_sid and seq = 2;
  v_res := public.submit_answer(v_uid, v_sid, 2, '{"value":"NIE"}'::jsonb);
  assert (v_res->>'xp')::int = 16, format('xp=16 (10+5+combo1), było %s', v_res->>'xp');

  -- pytanie 3: BŁĘDNIE → combo reset, xp 0
  perform public.mark_question_served(v_uid, v_sid, 3);
  update public.session_questions set served_at = now() - interval '3 seconds'
   where session_id = v_sid and seq = 3;
  v_res := public.submit_answer(v_uid, v_sid, 3, '{"value":"PRAWE"}'::jsonb);
  assert not (v_res->>'correct')::boolean;
  assert (v_res->>'xp')::int = 0;
  assert (v_res->>'combo')::int = 0;

  -- pytania 4-6 poprawnie (wolno — bez bonusu szybkości, ale w limicie 20+3 s)
  for i in 4..6 loop
    perform public.mark_question_served(v_uid, v_sid, i);
    update public.session_questions set served_at = now() - interval '22 seconds'
     where session_id = v_sid and seq = i;
  end loop;
  perform public.submit_answer(v_uid, v_sid, 4, '{"index":2}'::jsonb);
  perform public.submit_answer(v_uid, v_sid, 5, '{"index":0}'::jsonb);
  v_res := public.submit_answer(v_uid, v_sid, 6, '{"index":1}'::jsonb);
  assert (v_res->>'combo')::int = 3, 'combo po 3 poprawnych z rzędu';
  assert (v_res->>'answeredCount')::int = 6;
end $$;

-- ------------------------------------------------------------------
-- 3b. Prefetch (0006): odpowiedź BEZ beacona served — bez bonusu i bez kary
-- ------------------------------------------------------------------
do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_sid uuid;
  v_res jsonb;
begin
  v_sid := public.create_session(
    v_uid, 'learning', 'mix', null,
    '[
      {"seq":1,"qtype":"theory","dedupeKey":"pf1","payload":{"q":1},"correctAnswer":{"index":0},"explanation":null,"imagePath":null},
      {"seq":2,"qtype":"theory","dedupeKey":"pf2","payload":{"q":2},"correctAnswer":{"index":1},"explanation":null,"imagePath":null}
    ]'::jsonb
  );

  -- served_at nie ustawione (beacon nie zdążył) → odpowiedź przechodzi,
  -- czas nieznany: zero bonusu za szybkość i zero kary too_fast.
  v_res := public.submit_answer(v_uid, v_sid, 1, '{"index":0}'::jsonb);
  assert (v_res->>'correct')::boolean, 'prefetch: odpowiedź miała być poprawna';
  assert (v_res->>'xp')::int = 10, format('prefetch: xp=10 bez bonusu, było %s', v_res->>'xp');
  assert (v_res->>'timeMs')::int = 0, 'prefetch: brak pomiaru czasu';
  assert (select time_ms from public.session_questions
           where session_id = v_sid and seq = 1) is null,
         'prefetch: time_ms w bazie ma być NULL';
end $$;

-- ------------------------------------------------------------------
-- 3c. Dekory (0007): kategoria 'dekory' + swatch_path w obie strony
-- ------------------------------------------------------------------
do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_sid uuid;
begin
  v_sid := public.create_session(
    v_uid, 'learning', 'dekory', null,
    '[
      {"seq":1,"qtype":"feature_yn","dedupeKey":"dk1","payload":{"q":1},"correctAnswer":{"value":"TAK"},"explanation":null,"imagePath":"p/n1a.jpg","swatchPath":"dekory/orzech.jpg"},
      {"seq":2,"qtype":"feature_yn","dedupeKey":"dk2","payload":{"q":2},"correctAnswer":{"value":"NIE"},"explanation":null,"imagePath":"p/n2a.jpg"}
    ]'::jsonb
  );

  assert (select category from public.quiz_sessions where id = v_sid) = 'dekory',
    'kategoria dekory przyjęta przez check constraint';
  assert (select swatch_path from public.session_questions
           where session_id = v_sid and seq = 1) = 'dekory/orzech.jpg',
    'swatchPath ma trafiać do swatch_path';
  assert (select swatch_path from public.session_questions
           where session_id = v_sid and seq = 2) is null,
    'brak klucza swatchPath = NULL w swatch_path';

  perform public.append_questions(v_uid, v_sid,
    '[{"seq":3,"qtype":"feature_yn","dedupeKey":"dk3","payload":{"q":3},"correctAnswer":{"value":"TAK"},"explanation":null,"imagePath":null,"swatchPath":"dekory/bialy.jpg"}]'::jsonb);
  assert (select swatch_path from public.session_questions
           where session_id = v_sid and seq = 3) = 'dekory/bialy.jpg',
    'append_questions przenosi swatchPath';
end $$;

-- ------------------------------------------------------------------
-- 3d. Limit czasu (0009): odpowiedź po limicie = błędna
-- ------------------------------------------------------------------
do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_sid uuid;
  v_res jsonb;
begin
  v_sid := public.create_session(
    v_uid, 'learning', 'mix', null,
    '[
      {"seq":1,"qtype":"theory","dedupeKey":"tl1","payload":{},"correctAnswer":{"index":0},"explanation":null,"imagePath":null},
      {"seq":2,"qtype":"theory","dedupeKey":"tl2","payload":{},"correctAnswer":{"index":1},"explanation":null,"imagePath":null},
      {"seq":3,"qtype":"theory","dedupeKey":"tl3","payload":{},"correctAnswer":{"index":2},"explanation":null,"imagePath":null}
    ]'::jsonb
  );

  -- 25 s > limit nauki (20+3) → poprawna treść, ale werdykt BŁĘDNA, xp=0
  perform public.mark_question_served(v_uid, v_sid, 1);
  update public.session_questions set served_at = now() - interval '25 seconds'
   where session_id = v_sid and seq = 1;
  v_res := public.submit_answer(v_uid, v_sid, 1, '{"index":0}'::jsonb);
  assert not (v_res->>'correct')::boolean, 'po limicie ma być błędna';
  assert (v_res->>'xp')::int = 0, 'po limicie zero XP';

  -- 10 s → w limicie, poprawna
  perform public.mark_question_served(v_uid, v_sid, 2);
  update public.session_questions set served_at = now() - interval '10 seconds'
   where session_id = v_sid and seq = 2;
  v_res := public.submit_answer(v_uid, v_sid, 2, '{"index":1}'::jsonb);
  assert (v_res->>'correct')::boolean, 'w limicie ma być poprawna';

  -- auto-oddanie klienta {"timeout":true} → błędna
  perform public.mark_question_served(v_uid, v_sid, 3);
  update public.session_questions set served_at = now() - interval '21 seconds'
   where session_id = v_sid and seq = 3;
  v_res := public.submit_answer(v_uid, v_sid, 3, '{"timeout":true}'::jsonb);
  assert not (v_res->>'correct')::boolean, 'timeout = błędna';
end $$;

-- ------------------------------------------------------------------
-- 4. finish_session: bonusy, streak, odznaki, idempotencja
-- ------------------------------------------------------------------
do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_sid uuid := current_setting('test.sid')::uuid;
  v_sum jsonb;
  v_sum2 jsonb;
  v_events_total int;
begin
  v_sum := public.finish_session(v_uid, v_sid);

  assert (v_sum->'bonuses'->>'learning')::int = 20, 'bonus za ukończenie nauki';
  assert (v_sum->>'perfect')::boolean = false;
  assert (v_sum->'streak'->>'current')::int = 1, 'streak = 1 po pierwszym dniu';
  assert (v_sum->'streak'->>'firstToday')::boolean = true;
  assert (v_sum->'bonuses'->>'streak')::int = 5, 'bonus streaka 5×min(1,10)';
  assert v_sum->'newBadges' @> '[{"id":"first_session"}]'::jsonb,
    'odznaka za pierwszy quiz';
  assert (v_sum->>'correct')::int = 5;

  -- KLUCZOWY INWARIANT: cache total_xp == suma xp_events
  select coalesce(sum(amount), 0) into v_events_total
    from public.xp_events where user_id = v_uid;
  assert (select total_xp from public.user_stats where user_id = v_uid) = v_events_total,
    format('total_xp (%s) != suma xp_events (%s)',
      (select total_xp from public.user_stats where user_id = v_uid), v_events_total);

  -- xp_earned sesji == suma eventów sesji
  assert (select xp_earned from public.quiz_sessions where id = v_sid) =
    (select coalesce(sum(amount), 0) from public.xp_events where session_id = v_sid),
    'xp_earned sesji niespójne z xp_events';

  -- idempotencja
  v_sum2 := public.finish_session(v_uid, v_sid);
  assert v_sum2 = v_sum, 'ponowny finish ma zwrócić to samo summary';
  assert (select count(*) from public.user_badges where user_id = v_uid
          and badge_id = 'first_session') = 1;
end $$;

-- ------------------------------------------------------------------
-- 5. Wyzwanie: błąd kończy grę, rekord zapisany
-- ------------------------------------------------------------------
select public.create_session(
  current_setting('test.uid')::uuid, 'challenge', null, null,
  '[
    {"seq":1,"qtype":"theory","dedupeKey":"c1","payload":{},"correctAnswer":{"index":0},"explanation":null,"imagePath":null},
    {"seq":2,"qtype":"theory","dedupeKey":"c2","payload":{},"correctAnswer":{"index":1},"explanation":null,"imagePath":null},
    {"seq":3,"qtype":"theory","dedupeKey":"c3","payload":{},"correctAnswer":{"index":2},"explanation":null,"imagePath":null}
  ]'::jsonb) as csid
\gset
select set_config('test.csid', :'csid', false);

do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_sid uuid := current_setting('test.csid')::uuid;
  v_res jsonb;
  v_sum jsonb;
begin
  -- 1 poprawna
  perform public.mark_question_served(v_uid, v_sid, 1);
  update public.session_questions set served_at = now() - interval '3 seconds'
   where session_id = v_sid and seq = 1;
  v_res := public.submit_answer(v_uid, v_sid, 1, '{"index":0}'::jsonb);
  assert (v_res->>'sessionStatus') = 'active';

  -- błąd → koniec gry
  perform public.mark_question_served(v_uid, v_sid, 2);
  update public.session_questions set served_at = now() - interval '3 seconds'
   where session_id = v_sid and seq = 2;
  v_res := public.submit_answer(v_uid, v_sid, 2, '{"index":3}'::jsonb);
  assert (v_res->>'sessionStatus') = 'finished', 'błąd w wyzwaniu kończy sesję';

  -- odpowiedź po końcu gry → wyjątek
  begin
    perform public.submit_answer(v_uid, v_sid, 3, '{"index":2}'::jsonb);
    raise exception 'oczekiwano session_not_active';
  exception when others then
    if sqlerrm <> 'session_not_active' then raise; end if;
  end;

  v_sum := public.finish_session(v_uid, v_sid);
  assert (v_sum->>'isChallengeRecord')::boolean = true;
  assert (v_sum->>'bestChallenge')::int = 1;
  assert (v_sum->'streak'->>'firstToday')::boolean = false,
    'streak zaliczony już wcześniej dziś';
end $$;

-- ------------------------------------------------------------------
-- 6. Jedna aktywna sesja: nowa porzuca starą
-- ------------------------------------------------------------------
do $$
declare
  v_uid uuid := current_setting('test.uid')::uuid;
  v_s1 uuid;
  v_s2 uuid;
begin
  v_s1 := public.create_session(v_uid, 'learning', 'theory', null,
    '[{"seq":1,"qtype":"theory","dedupeKey":"x1","payload":{},"correctAnswer":{"index":0},"explanation":null,"imagePath":null}]'::jsonb);
  v_s2 := public.create_session(v_uid, 'learning', 'theory', null,
    '[{"seq":1,"qtype":"theory","dedupeKey":"x1","payload":{},"correctAnswer":{"index":0},"explanation":null,"imagePath":null}]'::jsonb);
  assert (select status from public.quiz_sessions where id = v_s1) = 'abandoned',
    'stara sesja porzucona';
  assert (select status from public.quiz_sessions where id = v_s2) = 'active';
end $$;

-- ------------------------------------------------------------------
-- 7. Rankingi
-- ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', current_setting('test.uid'), false);

do $$
declare
  v_lb jsonb;
begin
  v_lb := public.get_leaderboard('daily', 10);
  assert jsonb_array_length(v_lb->'top') >= 1, 'ranking dzienny pusty';
  assert (v_lb->'me'->>'rank')::int = 1, 'moja pozycja w rankingu';

  v_lb := public.get_leaderboard('alltime', 10);
  assert jsonb_array_length(v_lb->'top') >= 1;

  v_lb := public.get_challenge_leaderboard(10);
  assert (v_lb->'me'->>'score')::int = 1;

  v_lb := public.get_company_leaderboard();
  assert v_lb ? 'top'; -- < 3 aktywnych → pusto, ale struktura poprawna
end $$;

-- ------------------------------------------------------------------
-- 8. RLS: klient (authenticated) nie widzi tabel wrażliwych
-- ------------------------------------------------------------------
set role authenticated;

do $$
declare v_uid uuid := current_setting('test.uid')::uuid;
begin
  -- własny profil: TAK
  assert (select count(*) from public.profiles) = 1, 'własny profil widoczny';
  -- pytania sesji (correct_answer!): NIE
  assert (select count(*) from public.session_questions) = 0,
    'session_questions MUSI być niewidoczne dla klienta';
  -- katalog z odpowiedziami: NIE
  assert (select count(*) from public.door_models) = 0,
    'door_models MUSI być niewidoczne dla klienta';
  assert (select count(*) from public.theory_questions) = 0,
    'theory_questions MUSI być niewidoczne dla klienta';
  assert (select count(*) from public.daily_quiz) = 0;
  -- własne statystyki: TAK
  assert (select count(*) from public.user_stats) = 1;
  -- odznaki (katalog): TAK
  assert (select count(*) from public.badges) > 0;
end $$;

-- funkcje gry niedostępne dla klienta
do $$
begin
  begin
    perform public.submit_answer(current_setting('test.uid')::uuid,
      gen_random_uuid(), 1, '{}'::jsonb);
    raise exception 'oczekiwano permission denied';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

-- ------------------------------------------------------------------
-- 9. Role (0008): nadanie tylko service role, RLS, has_role
-- ------------------------------------------------------------------
insert into auth.users (email) values ('drugi@dre.pl') returning id as uid2
\gset
select set_config('test.uid2', :'uid2', false);

-- nadanie admina testerowi — service role (bez RLS)
insert into public.user_roles (user_id, role)
values (current_setting('test.uid')::uuid, 'admin');

-- kontekst JWT wciąż wskazuje testera (sekcja 7)
set role authenticated;
do $$
begin
  assert (select count(*) from public.user_roles) = 1,
    'użytkownik widzi tylko własne role';
  assert public.has_role('admin'), 'has_role(admin) dla admina';
  assert not public.has_role('nieistniejaca'), 'nieznana rola = false';
  -- samodzielne nadanie sobie roli → odmowa (brak polityki INSERT)
  begin
    insert into public.user_roles (user_id, role)
    values (current_setting('test.uid')::uuid, 'admin');
    raise exception 'oczekiwano odmowy zapisu do user_roles';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- drugi użytkownik: cudze role niewidoczne, brak admina
select set_config('request.jwt.claim.sub', current_setting('test.uid2'), false);
set role authenticated;
do $$
begin
  assert (select count(*) from public.user_roles) = 0,
    'cudze role MUSZĄ być niewidoczne';
  assert not public.has_role('admin'), 'drugi użytkownik nie jest adminem';
end $$;
reset role;

-- ------------------------------------------------------------------
-- 10. Ustawienia globalne (0010): zapis/odczyt service role, RLS
-- ------------------------------------------------------------------
do $$
begin
  assert (select value from public.app_settings where key = 'question_mix')
         ? 'technical',
    'seed question_mix zawiera wagi kategorii';
  assert (select (value)::int from public.app_settings
           where key = 'daily_quiz_size') = 10,
    'seed daily_quiz_size = 10 (0011)';

  update public.app_settings
     set value = '{"models":10,"technical":50,"dekory":0,"left_right":20,"theory":20}'::jsonb
   where key = 'question_mix';
  assert (select (value->>'technical')::int from public.app_settings
           where key = 'question_mix') = 50,
    'service role może zmienić proporcje';
end $$;

-- klient nie widzi ustawień (RLS bez polityk) i nie może ich zmienić
select set_config('request.jwt.claim.sub', current_setting('test.uid'), false);
set role authenticated;
do $$
begin
  assert (select count(*) from public.app_settings) = 0,
    'app_settings MUSI być niewidoczne dla klienta';
  begin
    insert into public.app_settings (key, value) values ('x', '{}'::jsonb);
    raise exception 'oczekiwano odmowy zapisu do app_settings';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'SMOKE TEST OK' as result;
