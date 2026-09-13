import {identity,failure} from '@/lib/api';
import {getAdminSupabase} from '@/lib/supabase-server';
import {uuid} from '@/lib/security';
export async function POST(request:Request){
 try{
  const {user}=await identity(request),input=await request.json(),admin=getAdminSupabase();
  if(input.action==='preview'){
   if(!uuid(input.brandId)||!uuid(input.campaignId)) throw new Error('Invalid campaign');
   const {data,error}=await admin.rpc('prepare_dispatch',{actor:user.id,target:input.brandId,campaign:input.campaignId});
   if(error) throw new Error(error.message);
   const {data:preview,error:e}=await admin.from('dispatches').select('id,recipient_count,recipients,campaign_name,created_at').eq('id',data).single();
   if(e) throw new Error(e.message);
   return Response.json(preview,{headers:{'Cache-Control':'no-store'}});
  }
  if(input.action!=='approve'||!uuid(input.previewId)||!Number.isInteger(input.count)) throw new Error('Invalid approval');
  const {data,error}=await admin.rpc('approve_dispatch',{actor:user.id,target:input.previewId,expected:input.count});
  if(error) throw new Error(error.message);
  return Response.json({id:data,state:'queued'},{status:202});
 }catch(error){return failure(error)}
}
