create or replace view public.campaign_results with(security_invoker=true) as
select c.id,c.brand_id,c.external_id,c.campaign_name,c.channel,c.target_country,
 case when d.approved_at is null then c.reported_sent else coalesce(jsonb_array_length(d.provider_response->'accepted'),0) end as reported_sent,
 case when d.approved_at is null then c.reported_delivered else coalesce(e.delivered,0) end as reported_delivered,
 case when d.approved_at is null then c.reported_bounced else coalesce(e.bounced,0) end as reported_bounced,
 case when d.approved_at is null then c.reported_opens else coalesce(e.opened,0) end as reported_opens,
 case when d.approved_at is null then c.reported_clicks else coalesce(e.clicked,0) end as reported_clicks,
 coalesce(d.approved_at,c.sent_at_utc) as sent_at_utc,
 case when d.id is null then 'Imported report totals (opens may repeat)' else 'Unique recipients per event type; a bounce overrides delivery' end as metric_basis,
 d.id as dispatch_id,d.state as dispatch_state,d.last_error,d.last_polled_at,d.recipient_count as approved_count,
 coalesce(jsonb_array_length(d.provider_response->'rejected'),0) as rejected_count
from public.campaigns c left join public.dispatches d on d.campaign_id=c.id and d.brand_id=c.brand_id and d.approved_at is not null
left join lateral(
 select count(*) filter(where delivered and not bounced) as delivered,count(*) filter(where bounced) as bounced,
 count(*) filter(where opened) as opened,count(*) filter(where clicked) as clicked from (
 select contact_id,bool_or(kind='delivered') delivered,bool_or(kind='bounced') bounced,bool_or(kind='opened') opened,bool_or(kind='clicked') clicked
 from public.delivery_events where dispatch_id=d.id group by contact_id) r
) e on true;
grant select on public.campaign_results to authenticated,service_role;
