import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {parseCsv} from './import-seed.mjs';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const file='kilele-send-log.csv',raw=fs.readFileSync('data/raw/'+file,'utf8'),source=file+'#'+createHash('sha256').update(raw).digest('hex');
const {data:brand,error}=await db.from('brands').select('id').eq('slug','kilele').single();if(error)throw error;
const {data:prior}=await db.from('import_runs').select('id').eq('brand_id',brand.id).eq('source_file',source).limit(1);
if(prior?.length)console.log('Send log already imported');else{
 const parsed=parseCsv(raw),errors=[];let applied=0;
 for(const {line,value:r} of parsed){try{
  if(!r||!r.batch_key||!['queued','sending','sent','completed','failed'].includes(r.status)||!Number.isInteger(Number(r.recipient_count))||Number(r.recipient_count)<0||!Number.isFinite(Date.parse(r.queued_at_utc)))throw new Error('Invalid historical send row');
  const {data:c,error:e}=await db.from('campaigns').select('id').eq('brand_id',brand.id).eq('external_id',r.campaign_external_id).single();if(e)throw new Error('Campaign relationship not found');
  const {error:u}=await db.from('send_batches').upsert({brand_id:brand.id,campaign_id:c.id,batch_key:r.batch_key,approved_recipient_count:Number(r.recipient_count),status:r.status,approved_at:r.queued_at_utc,provider_response:{source:'Historical send log; recipient identities unavailable'}},{onConflict:'brand_id,batch_key'});if(u)throw u;applied++;
 }catch(e){errors.push({line,reason:e.message})}}
 const {error:e}=await db.from('import_runs').insert({brand_id:brand.id,source_file:source,rows_seen:parsed.length,rows_imported:applied,rows_skipped:errors.length,errors});if(e)throw e;console.log('Historical send log',parsed.length,applied,errors.length);
}
