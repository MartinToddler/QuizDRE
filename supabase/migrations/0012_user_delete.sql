-- QuizDRE 0012: usuwanie konta użytkownika wraz z całym postępem.
--
-- Usunięcie wiersza z auth.users kaskadowo czyści profiles, a z niego cały
-- postęp gry: user_stats, xp_events, user_badges, mission_completions,
-- quiz_sessions (→ session_questions), push_subscriptions, notification_log
-- oraz user_roles.user_id. Wszystkie te FK mają już `on delete cascade`.
--
-- PROBLEM, który ta migracja naprawia: dwa klucze obce wskazujące „autora”
-- nie miały żadnej akcji ON DELETE, więc konto, które kiedykolwiek nadało
-- rolę (user_roles.granted_by) albo zapisało ustawienia
-- (app_settings.updated_by), NIE dałoby się usunąć — delete padał na
-- naruszeniu klucza obcego. Po zmianie autorstwo „odczepia się” (NULL),
-- a wpis (rola / ustawienie) zostaje nietknięty.

alter table public.user_roles
  drop constraint if exists user_roles_granted_by_fkey;
alter table public.user_roles
  add constraint user_roles_granted_by_fkey
  foreign key (granted_by) references public.profiles (id) on delete set null;

alter table public.app_settings
  drop constraint if exists app_settings_updated_by_fkey;
alter table public.app_settings
  add constraint app_settings_updated_by_fkey
  foreign key (updated_by) references public.profiles (id) on delete set null;
