-- First provision Vault secret velocity_worker_secret with the same value as
-- Vercel's WORKER_SECRET. Do not put the value in this file or cron.job.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('velocity-delivery-worker','* * * * *',$job$
 select net.http_post(
  url:='https://velocity-growth-campaign-portal.vercel.app/api/worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='velocity_worker_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 );
$job$);
