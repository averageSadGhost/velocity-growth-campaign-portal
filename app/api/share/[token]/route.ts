import {getAdminSupabase} from '@/lib/supabase-server';
import {passwordMatches} from '@/lib/security';
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 const headers={'Cache-Control':'no-store'};
 try{
  const {token}=await params,input=await request.json();
  if(!/^[a-f0-9]{48}$/.test(token)||typeof input.password!=='string'||input.password.length>256) return Response.json({error:'Invalid link or password'},{status:401,headers});
  const admin=getAdminSupabase();
  const {data:allowed,error:e}=await admin.rpc('consume_share_attempt',{target:token});
  if(e) throw e;
  if(!allowed) return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429,headers});
  const {data:share}=await admin.from('share_links').select('brand_id,campaign_id,password_hash,revoked_at').eq('token',token).maybeSingle();
  if(!share||share.revoked_at||!passwordMatches(input.password,share.password_hash)) return Response.json({error:'Invalid link or password'},{status:401,headers});
  const {data:campaign,error}=await admin.from('campaign_results').select('campaign_name,channel,reported_sent,reported_delivered,reported_bounced,reported_opens,reported_clicks,sent_at_utc,metric_basis').eq('id',share.campaign_id).eq('brand_id',share.brand_id).single();
  if(error) throw error;
  return Response.json({campaign},{headers});
 }catch{return Response.json({error:'Results temporarily unavailable'},{status:503,headers});}
}
