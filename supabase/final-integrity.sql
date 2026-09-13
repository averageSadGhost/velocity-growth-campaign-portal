-- Preserve approvals and record sanitized provider diagnostics, never foreign recipient data.
alter table public.dispatches add column if not exists report_warnings jsonb not null default '{}';
create or replace function public.preserve_approval() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.approved_at is not null and row(new.brand_id,new.campaign_id,new.created_by,new.campaign_name,new.brand_name,new.channel,new.recipients,new.recipient_count,new.approved_at)
 is distinct from row(old.brand_id,old.campaign_id,old.created_by,old.campaign_name,old.brand_name,old.channel,old.recipients,old.recipient_count,old.approved_at) then
 raise exception 'Approved audience and approval details are immutable'; end if;
 return new;
end $$;
revoke all on function public.preserve_approval() from public,anon,authenticated;
create trigger preserve_approval before update on public.dispatches for each row execute function public.preserve_approval();
alter table public.campaigns add constraint valid_campaign_input check (length(trim(campaign_name)) between 1 and 120 and lower(channel) in ('email','sms') and reported_sent>=0 and reported_delivered>=0 and reported_bounced>=0 and reported_opens>=0 and reported_clicks>=0 and spend>=0) not valid;
create unique index if not exists dispatch_brand_identity on public.dispatches(brand_id,id);
alter table public.delivery_events add constraint event_dispatch_tenant foreign key(brand_id,dispatch_id) references public.dispatches(brand_id,id);
