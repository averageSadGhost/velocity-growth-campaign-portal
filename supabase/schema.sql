-- Velocity Growth campaign portal schema.
-- Apply in Supabase SQL editor. All brand-scoped tables use the same RLS helper.
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'analyst');
create type public.delivery_status as enum ('queued', 'sending', 'sent', 'completed', 'failed');

create table public.brands (
  id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  country text not null, accent text not null default '#ff6542', created_at timestamptz not null default now()
);
create table public.brand_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  role public.member_role not null, created_at timestamptz not null default now(),
  unique(user_id, brand_id)
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  external_id text not null, full_name text, email text, phone text, country text, city text,
  signup_at timestamptz, status text, consent_marketing boolean not null default false,
  deleted_at timestamptz, suppressed_until timestamptz, brand_code text, notes text, source_file text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(brand_id, external_id)
);
create index contacts_brand_signup_idx on public.contacts(brand_id, signup_at);
create index contacts_brand_email_idx on public.contacts(brand_id, email);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  external_id text not null, campaign_name text not null, channel text not null,
  target_country text, reported_sent integer not null default 0, reported_delivered integer not null default 0,
  reported_bounced integer not null default 0, reported_opens integer not null default 0, reported_clicks integer not null default 0,
  spend numeric(12,2) not null default 0, sent_at_utc timestamptz, send_local_time text, parent_campaign_id text,
  created_at timestamptz not null default now(), unique(brand_id, external_id)
);
create table public.provider_events (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  event_id text not null, external_contact_id text not null, campaign_external_id text not null,
  event_type text not null, channel text, occurred_at_utc timestamptz not null,
  received_at timestamptz not null default now(), unique(brand_id, event_id)
);
create table public.send_batches (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id), batch_key text not null,
  approved_recipient_count integer not null, status public.delivery_status not null default 'queued',
  provider_response jsonb, approved_at timestamptz not null default now(), completed_at timestamptz,
  unique(brand_id, batch_key)
);
create table public.share_links (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id), token text not null unique default encode(gen_random_bytes(24), 'hex'),
  password_hash text not null, revoked_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.import_runs (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id) on delete cascade,
  source_file text not null, rows_seen integer not null default 0, rows_imported integer not null default 0,
  rows_skipped integer not null default 0, errors jsonb not null default '[]', created_at timestamptz not null default now()
);

create or replace function public.member_brand_ids()
returns setof uuid language sql stable security invoker set search_path = public
as $$ select brand_id from public.brand_members where user_id = (select auth.uid()) $$;
create or replace function public.is_brand_owner(target_brand uuid)
returns boolean language sql stable security invoker set search_path = public
as $$ select exists(select 1 from public.brand_members where user_id = (select auth.uid()) and brand_id = target_brand and role = 'owner') $$;

alter table public.brands enable row level security;
alter table public.brand_members enable row level security;
alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.provider_events enable row level security;
alter table public.send_batches enable row level security;
alter table public.share_links enable row level security;
alter table public.import_runs enable row level security;

create policy "members read their brands" on public.brands for select to authenticated using (id in (select public.member_brand_ids()));
create policy "members read own membership" on public.brand_members for select to authenticated using (user_id = (select auth.uid()));
create policy "members read contacts" on public.contacts for select to authenticated using (brand_id in (select public.member_brand_ids()));
create policy "members read campaigns" on public.campaigns for select to authenticated using (brand_id in (select public.member_brand_ids()));
create policy "members read events" on public.provider_events for select to authenticated using (brand_id in (select public.member_brand_ids()));
create policy "members read batches" on public.send_batches for select to authenticated using (brand_id in (select public.member_brand_ids()));
create policy "owners create batches" on public.send_batches for insert to authenticated with check (public.is_brand_owner(brand_id));
create policy "owners update batches" on public.send_batches for update to authenticated using (public.is_brand_owner(brand_id)) with check (public.is_brand_owner(brand_id));
create policy "owners read shares" on public.share_links for select to authenticated using (brand_id in (select public.member_brand_ids()));
create policy "owners create shares" on public.share_links for insert to authenticated with check (public.is_brand_owner(brand_id));
create policy "members read imports" on public.import_runs for select to authenticated using (brand_id in (select public.member_brand_ids()));

-- The public result route must use a server-side password check and never expose this table through anon.
revoke all on public.share_links from anon;
revoke all on public.share_links from authenticated;

grant select on public.brands, public.brand_members, public.contacts, public.campaigns, public.provider_events, public.send_batches, public.import_runs to authenticated;
grant insert, update on public.send_batches to authenticated;
grant select, insert on public.share_links to authenticated;
