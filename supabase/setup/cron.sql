-- Harmonogram przypomnień push — uruchom RAZ w SQL Editorze projektu Supabase
-- po wdrożeniu Edge Function `send-reminders`.
--
-- Podmień:
--   <PROJECT-REF>  → ref projektu (z URL-a dashboardu)
--   <CRON_SECRET>  → ten sam sekret, który ustawiono w
--                    `supabase secrets set CRON_SECRET=...`
--
-- Cron działa w UTC; funkcja sama liczy godzinę Europe/Warsaw, więc
-- godzinowy tick jest odporny na zmianę czasu (DST).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'quizdre-send-reminders',
  '5 * * * *', -- co godzinę, 5 minut po pełnej
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-reminders',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    )
  );
  $$
);

-- Podgląd: select * from cron.job;
-- Usunięcie: select cron.unschedule('quizdre-send-reminders');
