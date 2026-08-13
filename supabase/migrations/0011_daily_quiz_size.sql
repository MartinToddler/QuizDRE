-- QuizDRE 0011: długość Quizu Dnia jako ustawienie admina.
--
-- Kolejny klucz w app_settings (0010): liczba pytań dziennego zestawu.
-- Zakres wymuszany po stronie aplikacji (dailyQuizSizeSchema: 5–30),
-- domyślnie 10 = DAILY_QUIZ_SIZE w src/lib/engine/generators.ts.
-- Zmiana obowiązuje od NASTĘPNEGO dnia — dzisiejszy zestaw jest już
-- wygenerowany i zapisany w daily_quiz (wszyscy grają to samo).

insert into public.app_settings (key, value) values ('daily_quiz_size', '10'::jsonb)
  on conflict (key) do nothing;
