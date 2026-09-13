-- Run using the administrative SQL connection. Always rollback; no test rows persist.
begin;
do $$
declare actor record; visible integer; expected integer; leaked integer;
begin
 for actor in select user_id,brand_id,role from public.brand_members loop
  select count(*) into expected from public.brands b where b.id in(select brand_id from public.brand_members where user_id=actor.user_id);
  perform set_config('request.jwt.claim.sub',actor.user_id::text,true);
  set local role authenticated;
  select count(*) into visible from public.brands;
  if visible<>expected then raise exception 'Brand isolation failed for %',actor.user_id; end if;
  select count(*) into leaked from public.contacts where brand_id not in(select public.member_brand_ids());
  if leaked<>0 then raise exception 'Contact isolation failed'; end if;
  select count(*) into leaked from public.campaign_results where brand_id not in(select public.member_brand_ids());
  if leaked<>0 then raise exception 'Campaign view isolation failed'; end if;
  begin
   perform public.claim_dispatch();
   raise exception 'FAIL: client can claim worker jobs';
  exception when insufficient_privilege then null; end;
  begin
   perform count(*) from public.share_links;
   raise exception 'FAIL: client can read share password hashes';
  exception when insufficient_privilege then null; end;
  if actor.role='analyst' then
   begin
    insert into public.campaigns(brand_id,external_id,campaign_name,channel) values(actor.brand_id,'isolation-probe','probe','email');
    raise exception 'FAIL: analyst can create campaign';
   exception when insufficient_privilege then null; end;
  end if;
  reset role;
 end loop;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 set local role authenticated;
 if exists(select 1 from public.brands) or exists(select 1 from public.contacts) then raise exception 'Unassigned user has data access'; end if;
 reset role;
end $$;
rollback;
