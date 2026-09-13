-- Run as each test user in the Supabase SQL editor or an authenticated test client.
-- A user's visible brand IDs must exactly match their brand_members rows.
select id, name from public.brands order by name;
select brand_id, role from public.brand_members where user_id = (select auth.uid()) order by brand_id;

-- These queries must never return rows from a brand absent from the user's membership list.
select distinct brand_id from public.contacts where brand_id not in (select brand_id from public.member_brand_ids());
select distinct brand_id from public.campaigns where brand_id not in (select brand_id from public.member_brand_ids());

-- Owner-only operations must be rejected for analyst sessions by RLS.
-- Attempt an insert into campaigns and an insert into send_batches as an analyst;
-- both must fail with a permission/RLS error.
