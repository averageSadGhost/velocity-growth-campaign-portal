import {timingSafeEqual} from 'node:crypto';
import {getAdminSupabase} from '@/lib/supabase-server';
import {normalizeEvent} from '@/lib/provider';
export const maxDuration=60;
export async function POST(request:Request){
 const token=request.headers.get('authorization')??'',expected=`Bearer ${process.env.WORKER_SECRET??''}`;
 if(!process.env.WORKER_SECRET||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected))) return Response.json({error:'Unauthorized'},{status:401});
 const db=getAdminSupabase(),base=process.env.MESSAGING_PROVIDER_BASE_URL!,key=process.env.MESSAGING_PROVIDER_API_KEY;
 if(!key) return Response.json({error:'Provider configuration missing'},{status:503});
 const {data:jobs,error}=await db.rpc('claim_dispatch');
 if(error) return Response.json({error:error.message},{status:500});
 const d=jobs?.[0]; if(!d) return Response.json({idle:true});
 try{
  let batchId=d.provider_batch_id;
  if(!batchId){
   const response=await fetch(`${base}/v1/messages`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':d.id},body:JSON.stringify({campaign:d.campaign_name,brand:d.brand_name,recipients:d.recipients}),signal:AbortSignal.timeout(20000)});
   if(!response.ok) throw new Error(`Dispatch HTTP ${response.status}; same approval will retry`);
   const body=await response.json();
   if(typeof body.batch_id!=='string'||!Array.isArray(body.accepted)||!Array.isArray(body.rejected)) throw new Error('Invalid dispatch response; same key will retry');
   batchId=body.batch_id;
   const {error:e}=await db.from('dispatches').update({provider_batch_id:batchId,provider_response:body,state:'polling'}).eq('id',d.id);
   if(e) throw e;
  }
  let cursor=d.cursor;
  const warnings:Record<string,string>={...(d.report_warnings??{})};
  const {data:brand}=await db.from('brands').select('slug').eq('id',d.brand_id).single();
  const started=Date.now();
  for(let page=0;page<20&&Date.now()-started<20000;page++){
   const response=await fetch(`${base}/v1/messages/${encodeURIComponent(batchId)}/events${cursor?`?since=${encodeURIComponent(cursor)}`:''}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});
   if(!response.ok) throw new Error(`Reports HTTP ${response.status}`);
   const body=await response.json(); if(!Array.isArray(body.events)) throw new Error('Invalid event page');
   const audience=new Set(d.recipients.map((r:{external_id:string})=>r.external_id));
   const rows=[];
   for(const raw of body.events){
    try{const event=normalizeEvent(raw);const code=String(raw.brand_code??'').toLowerCase();
     if(!audience.has(event.contact_id)||(['kilele','karoo','marrakech'].includes(code)&&code!==brand?.slug))throw new Error('Report outside approved brand/audience');
     rows.push({...event,dispatch_id:d.id,brand_id:d.brand_id});
    }catch(error){warnings[String(raw.event_id??raw.id??'malformed')]=error instanceof Error?error.message:'Invalid event'}
   }
   if(rows.length){const {error:e}=await db.from('delivery_events').upsert(rows,{onConflict:'dispatch_id,event_id',ignoreDuplicates:true});if(e) throw e;}
   // Advance only after the entire page was validated and durably persisted.
   const waiting=body.has_more&&(body.next_cursor==null||String(body.next_cursor)===String(cursor));
   if(body.has_more){if(!waiting)cursor=String(body.next_cursor);}
   else cursor=null; // Full replay on next pass catches late and out-of-order events.
   const {error:e}=await db.from('dispatches').update({cursor,report_warnings:warnings,last_polled_at:new Date().toISOString(),last_error:null}).eq('id',d.id);if(e) throw e;
   if(!body.has_more||waiting) break;
  }
  const {error:e}=await db.from('dispatches').update({lease_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('id',d.id);if(e) throw e;
  return Response.json({processed:d.id});
 }catch(error){
  const message=error instanceof Error?error.message:String(error);
  await db.from('dispatches').update({lease_until:null,last_error:message,next_attempt_at:new Date(Date.now()+Math.min(900000,30000*2**Math.min(d.attempts,5))).toISOString()}).eq('id',d.id);
  return Response.json({error:message,id:d.id},{status:502});
 }
}
