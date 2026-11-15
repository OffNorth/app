create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Vérification des alertes toutes les 5 minutes ; le secret est lu dans Vault au moment de l'appel.
select cron.schedule(
  'marches-check-alerts',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://glvxxxoxcxsxdnbofgqf.supabase.co/functions/v1/alerts?action=check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alerts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
