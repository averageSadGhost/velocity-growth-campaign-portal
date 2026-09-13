-- Apply after schema.sql. Service-only RPCs are SECURITY INVOKER; never callable by clients.
create index if not exists events_contact_idx on public.provider_events(brand_id,external_contact_id,event_type);
create index if not exists contacts_brand_id_idx on public.contacts(brand_id,id);
create unique index if not exists campaigns_brand_id_unique on public.campaigns(brand_id,id);
alter table public.send_batches add constraint batch_campaign_tenant foreign key (brand_id,campaign_id) references public.campaigns(brand_id,id);
alter table public.share_links add constraint share_campaign_tenant foreign key (brand_id,campaign_id) references public.campaigns(brand_id,id);
revoke insert,update,delete on public.send_batches from authenticated;
revoke all on public.share_links from authenticated,anon;

create table public.dispatches (
 id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands,
 campaign_id uuid not null, created_by uuid not null references auth.users,
 campaign_name text not null, brand_name text not null, channel text not null,
 recipients jsonb not null, recipient_count integer not null check(recipient_count between 1 and 100000),
 state text not null default 'preview' check(state in ('preview','queued','sending','polling','attention')),
 created_at timestamptz not null default now(), approved_at timestamptz,
 provider_batch_id text unique, provider_response jsonb, cursor text,
 lease_until timestamptz, attempts integer not null default 0, last_error text,
 last_polled_at timestamptz, next_attempt_at timestamptz not null default now(),
 foreign key(brand_id,campaign_id) references public.campaigns(brand_id,id),
 check (jsonb_array_length(recipients)=recipient_count)
);
create unique index dispatch_campaign_once on public.dispatches(campaign_id) where approved_at is not null;
alter table public.dispatches enable row level security;
create policy "members read dispatches" on public.dispatches for select to authenticated using(brand_id in(select public.member_brand_ids()));
grant select on public.dispatches to authenticated;
grant all on public.dispatches to service_role;

create table public.delivery_events (
 dispatch_id uuid not null references public.dispatches, brand_id uuid not null references public.brands,
 event_id text not null, contact_id text not null, kind text not null,
 occurred_at timestamptz not null, payload jsonb not null,
 primary key(dispatch_id,event_id)
);
alter table public.delivery_events enable row level security;
create policy "members read delivery events" on public.delivery_events for select to authenticated using(brand_id in(select public.member_brand_ids()));
grant select on public.delivery_events to authenticated;
grant all on public.delivery_events to service_role;
create index delivery_contact_idx on public.delivery_events(brand_id,contact_id,kind);

create table public.share_attempts(key text primary key, attempts integer not null, window_at timestamptz not null);
alter table public.share_attempts enable row level security;
revoke all on public.share_attempts from anon,authenticated;
grant all on public.share_attempts to service_role;

create or replace view public.contact_eligibility with(security_invoker=true) as
select c.*, (
 c.consent_marketing and c.deleted_at is null and (c.suppressed_until is null or c.suppressed_until<=now())
 and lower(trim(coalesce(c.status,'')))='active'
 and not exists(select 1 from public.provider_events e where e.brand_id=c.brand_id and e.external_contact_id=c.external_id and lower(e.event_type) in ('bounce','bounced','unsubscribe','unsubscribed','complaint'))
 and not exists(select 1 from public.delivery_events e where e.brand_id=c.brand_id and e.contact_id=c.external_id and e.kind in ('bounced','unsubscribed','complaint'))
 ) as eligible
from public.contacts c;
grant select on public.contact_eligibility to authenticated,service_role;

create or replace function public.workspace_stats(target uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('total',count(*),'contactable',count(*) filter(where eligible),'signups',
 (select jsonb_agg(jsonb_build_object('day',day,'count',n) order by day) from (
 select d::date as day,count(c.id) n from generate_series((current_timestamp at time zone 'UTC')::date-29,(current_timestamp at time zone 'UTC')::date,interval '1 day') d
 left join public.contacts c on c.brand_id=target and c.signup_at>=d at time zone 'UTC' and c.signup_at<(d+interval '1 day') at time zone 'UTC'
 group by d) s)) from public.contact_eligibility where brand_id=target
$$;
revoke all on function public.workspace_stats(uuid) from public,anon;
grant execute on function public.workspace_stats(uuid) to authenticated,service_role;

create or replace function public.prepare_dispatch(actor uuid,target uuid,campaign uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare c public.campaigns; result uuid; audience jsonb; label text;
begin
 if not exists(select 1 from brand_members where user_id=actor and brand_id=target and role='owner') then raise exception 'Owner required'; end if;
 select * into strict c from campaigns where id=campaign and brand_id=target;
 select name into label from brands where id=target;
 if lower(c.channel) not in ('email','sms') then raise exception 'Unsupported campaign channel'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('external_id',external_id,'email',email,'phone',phone,'full_name',full_name) order by external_id),'[]') into audience
 from (select distinct on (case when lower(c.channel)='email' then lower(email) else regexp_replace(phone,'[^0-9+]','','g') end) external_id,email,phone,full_name
 from contact_eligibility where brand_id=target and eligible
 and (c.target_country is null or trim(c.target_country)='' or upper(country)=upper(c.target_country))
 and ((lower(c.channel)='email' and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or (lower(c.channel)='sms' and regexp_replace(phone,'[^0-9]','','g') ~ '^[0-9]{9,15}$'))
 order by (case when lower(c.channel)='email' then lower(email) else regexp_replace(phone,'[^0-9+]','','g') end),external_id) a;
 if jsonb_array_length(audience)=0 then raise exception 'No eligible recipients for this channel and target country'; end if;
 insert into dispatches(brand_id,campaign_id,created_by,campaign_name,brand_name,channel,recipients,recipient_count)
 values(target,campaign,actor,c.campaign_name,label,lower(c.channel),audience,jsonb_array_length(audience)) returning id into result;
 return result;
end $$;

create or replace function public.approve_dispatch(actor uuid,target uuid,expected integer) returns uuid language plpgsql security invoker set search_path=public as $$
declare d public.dispatches; existing uuid;
begin
 select * into strict d from dispatches where id=target for update;
 if not exists(select 1 from brand_members where user_id=actor and brand_id=d.brand_id and role='owner') then raise exception 'Owner required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.campaign_id::text,0));
 select id into existing from dispatches where campaign_id=d.campaign_id and approved_at is not null;
 if existing is not null then return existing; end if;
 if d.created_at<now()-interval '15 minutes' then raise exception 'Preview expired; prepare again'; end if;
 if expected<>d.recipient_count then raise exception 'Approved count mismatch'; end if;
 -- Any suppression since preview invalidates the approval, rather than silently changing it.
 if exists(select 1 from jsonb_array_elements(d.recipients) r left join contact_eligibility c on c.brand_id=d.brand_id and c.external_id=r->>'external_id'
 where c.id is null or not c.eligible or c.email is distinct from r->>'email' or c.phone is distinct from r->>'phone') then raise exception 'Audience changed; prepare again'; end if;
 update dispatches set state='queued',approved_at=now() where id=target;
 return target;
end $$;

create or replace function public.claim_dispatch() returns setof public.dispatches language sql security invoker set search_path=public as $$
 update dispatches set lease_until=now()+interval '90 seconds',attempts=attempts+1
 where id=(select id from dispatches where approved_at is not null and state in('queued','sending','polling') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by next_attempt_at for update skip locked limit 1)
 returning *
$$;
create or replace function public.consume_share_attempt(target text) returns boolean language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
 insert into share_attempts values(target,1,now()) on conflict(key) do update set
 attempts=case when share_attempts.window_at<now()-interval '15 minutes' then 1 else share_attempts.attempts+1 end,
 window_at=case when share_attempts.window_at<now()-interval '15 minutes' then now() else share_attempts.window_at end returning attempts into n;
 return n<=20;
end $$;
revoke all on function public.prepare_dispatch(uuid,uuid,uuid),public.approve_dispatch(uuid,uuid,integer),public.claim_dispatch(),public.consume_share_attempt(text) from public,anon,authenticated;
grant execute on function public.prepare_dispatch(uuid,uuid,uuid),public.approve_dispatch(uuid,uuid,integer),public.claim_dispatch(),public.consume_share_attempt(text) to service_role;

-- New objects fail closed; an explicit RLS policy and grant are required.
alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
