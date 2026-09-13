alter table public.contacts add column if not exists import_valid boolean not null default true;
alter policy "members read contacts" on public.contacts using(import_valid and brand_id in(select public.member_brand_ids()));
create or replace view public.contact_eligibility with(security_invoker=true) as
select c.id,c.brand_id,c.external_id,c.full_name,c.email,c.phone,c.country,c.city,c.signup_at,c.status,c.consent_marketing,c.deleted_at,c.suppressed_until,c.notes,c.source_file,c.created_at,c.updated_at,c.brand_code,(
 c.import_valid and c.consent_marketing and c.deleted_at is null and (c.suppressed_until is null or c.suppressed_until<=now())
 and lower(trim(coalesce(c.status,'')))='active'
 and not exists(select 1 from public.provider_events e where e.brand_id=c.brand_id and e.external_contact_id=c.external_id and lower(e.event_type) in ('bounce','bounced','unsubscribe','unsubscribed','complaint'))
 and not exists(select 1 from public.delivery_events e where e.brand_id=c.brand_id and e.contact_id=c.external_id and e.kind in ('bounced','unsubscribed','complaint'))
 ) as eligible from public.contacts c where c.import_valid;
