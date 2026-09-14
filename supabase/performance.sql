-- Performance. Apply after import-validity.sql. Safe to re-run.
-- 1. Precompute event-based suppression on contacts so eligibility, counts and
--    dashboard stats no longer probe the event tables per request.
alter table public.contacts add column if not exists event_suppressed boolean not null default false;

create or replace function public.suppressing_event(kind text) returns boolean
language sql immutable as $$
 select lower(coalesce(kind,'')) in ('bounce','bounced','unsubscribe','unsubscribed','complaint')
$$;
revoke all on function public.suppressing_event(text) from public,anon,authenticated;

-- Backfill from imported history and live delivery reports.
update public.contacts c set event_suppressed=true where not c.event_suppressed and (
 exists(select 1 from public.provider_events e where e.brand_id=c.brand_id and e.external_contact_id=c.external_id and public.suppressing_event(e.event_type))
 or exists(select 1 from public.delivery_events e where e.brand_id=c.brand_id and e.contact_id=c.external_id and public.suppressing_event(e.kind)));

-- Keep it current. Statement-level triggers with transition tables handle bulk imports in one update.
create or replace function public.apply_event_suppression() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='provider_events' then
  update contacts c set event_suppressed=true from inserted i
   where c.brand_id=i.brand_id and c.external_id=i.external_contact_id and not c.event_suppressed and suppressing_event(i.event_type);
 else
  update contacts c set event_suppressed=true from inserted i
   where c.brand_id=i.brand_id and c.external_id=i.contact_id and not c.event_suppressed and suppressing_event(i.kind);
 end if;
 return null;
end $$;
revoke all on function public.apply_event_suppression() from public,anon,authenticated;
drop trigger if exists provider_events_suppress on public.provider_events;
create trigger provider_events_suppress after insert on public.provider_events
 referencing new table as inserted for each statement execute function public.apply_event_suppression();
drop trigger if exists delivery_events_suppress on public.delivery_events;
create trigger delivery_events_suppress after insert on public.delivery_events
 referencing new table as inserted for each statement execute function public.apply_event_suppression();

-- A contact imported after its events already exist starts with the right flag.
create or replace function public.inherit_event_suppression() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 new.event_suppressed := exists(select 1 from provider_events e where e.brand_id=new.brand_id and e.external_contact_id=new.external_id and suppressing_event(e.event_type))
  or exists(select 1 from delivery_events e where e.brand_id=new.brand_id and e.contact_id=new.external_id and suppressing_event(e.kind));
 return new;
end $$;
revoke all on function public.inherit_event_suppression() from public,anon,authenticated;
drop trigger if exists contacts_inherit_suppression on public.contacts;
create trigger contacts_inherit_suppression before insert on public.contacts
 for each row execute function public.inherit_event_suppression();

-- 2. Eligibility is now a row-local expression. Same rule, same columns, same grants.
create or replace view public.contact_eligibility with(security_invoker=true) as
select c.id,c.brand_id,c.external_id,c.full_name,c.email,c.phone,c.country,c.city,c.signup_at,c.status,c.consent_marketing,c.deleted_at,c.suppressed_until,c.notes,c.source_file,c.created_at,c.updated_at,c.brand_code,(
 c.import_valid and c.consent_marketing and not c.event_suppressed and c.deleted_at is null
 and (c.suppressed_until is null or c.suppressed_until<=now())
 and lower(trim(coalesce(c.status,'')))='active'
 ) as eligible from public.contacts c where c.import_valid;

-- 3. Dashboard stats: one pass over the brand's contacts plus one indexed range scan for signups.
--    Signups now count only valid imported rows, matching the "Total customers" definition.
create or replace function public.workspace_stats(target uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 with bounds as (
  select ((current_timestamp at time zone 'UTC')::date-29) as first_day,(current_timestamp at time zone 'UTC')::date as last_day
 ), daily as (
  select (c.signup_at at time zone 'UTC')::date as day,count(*) as n
  from public.contacts c,bounds b
  where c.brand_id=target and c.import_valid
   and c.signup_at>=b.first_day::timestamp at time zone 'UTC' and c.signup_at<(b.last_day+1)::timestamp at time zone 'UTC'
  group by 1
 ), series as (
  select generate_series(b.first_day,b.last_day,interval '1 day')::date as day from bounds b
 )
 select jsonb_build_object(
  'total',count(*),
  'contactable',count(*) filter(where eligible),
  'signups',(select jsonb_agg(jsonb_build_object('day',s.day,'count',coalesce(d.n,0)) order by s.day) from series s left join daily d on d.day=s.day)
 ) from public.contact_eligibility where brand_id=target
$$;

-- 4. Trigram indexes so contact search on the big brand uses indexes instead of a sequential scan.
create extension if not exists pg_trgm with schema extensions;
create index if not exists contacts_name_trgm on public.contacts using gin (full_name extensions.gin_trgm_ops);
create index if not exists contacts_email_trgm on public.contacts using gin (email extensions.gin_trgm_ops);
create index if not exists contacts_external_trgm on public.contacts using gin (external_id extensions.gin_trgm_ops);

-- 5. Import diagnostics are loaded on demand; the list only needs the count.
alter table public.import_runs add column if not exists issue_count integer generated always as (jsonb_array_length(errors)) stored;

analyze public.contacts; analyze public.import_runs;
