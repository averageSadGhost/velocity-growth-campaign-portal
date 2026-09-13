import {identity,failure} from '@/lib/api';
import {getAdminSupabase} from '@/lib/supabase-server';
import {passwordHash,uuid} from '@/lib/security';
export async function POST(request:Request){
 try{
  const {user,members,db}=await identity(request),input=await request.json();
  if(!uuid(input.campaignId)||!uuid(input.brandId)) throw new Error('Invalid campaign');
  if(!members.some(m=>m.brand_id===input.brandId&&m.role==='owner')) throw new Error('Forbidden');
  const {data:campaign}=await db.from('campaigns').select('id').eq('id',input.campaignId).eq('brand_id',input.brandId).single();
  if(!campaign) throw new Error('Forbidden');
  if(typeof input.password!=='string'||input.password.length<8||input.password.length>256) throw new Error('Use a password of 8–256 characters');
  const {data,error}=await getAdminSupabase().from('share_links').insert({brand_id:input.brandId,campaign_id:campaign.id,password_hash:passwordHash(input.password),created_by:user.id}).select('token').single();
  if(error) throw new Error(error.message);
  return Response.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error)}
}
