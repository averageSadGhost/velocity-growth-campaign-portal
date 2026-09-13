import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const base=process.env.TEST_BASE_URL??'http://localhost:3107';
async function client(email){const db=createClient(url,key,{auth:{persistSession:false}});const {data,error}=await db.auth.signInWithPassword({email,password:process.env.TEST_PASSWORD??'test123'});assert.ifError(error);return {db,token:data.session.access_token}}
async function post(path,body,token){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
const owner=await client('kilele.owner@velocity-growth.test'),analyst=await client('kilele.analyst@velocity-growth.test');
const {data:brands,error}=await owner.db.from('brands').select('id');assert.ifError(error);assert.equal(brands.length,1);const brandId=brands[0].id;
const stats=await owner.db.rpc('workspace_stats',{target:brandId});assert.ifError(stats.error);assert.equal(stats.data.signups.length,30);console.log('Tenant-scoped stats: PASS');
const campaign=await owner.db.from('campaigns').select('id').eq('brand_id',brandId).limit(1).single();assert.ifError(campaign.error);
assert.equal((await post('/api/send',{action:'preview',brandId,campaignId:campaign.data.id})).status,401);
assert.notEqual((await post('/api/send',{action:'preview',brandId,campaignId:campaign.data.id},analyst.token)).status,200);
assert.notEqual((await post('/api/send',{action:'preview',brandId:'da31fe18-c703-4456-9186-7d29d685b2af',campaignId:campaign.data.id},owner.token)).status,200);
assert.equal((await post('/api/worker',{})).status,401);console.log('API authorization: PASS');
if(process.env.TEST_MUTATIONS==='1'){
 const sharePassword=process.env.TEST_SHARE_PASSWORD;assert(sharePassword?.length>=8,'Set TEST_SHARE_PASSWORD to a private test password');
 const share=await post('/api/share',{brandId,campaignId:campaign.data.id,password:sharePassword},owner.token);assert.equal(share.status,200,JSON.stringify(share.body));
 const endpoint='/api/share/'+share.body.token;
 assert.equal((await post(endpoint,{password:'wrong'})).status,401);
 const report=await post(endpoint,{password:sharePassword});assert.equal(report.status,200);assert.deepEqual(Object.keys(report.body.campaign).sort(),['campaign_name','channel','reported_sent','reported_delivered','reported_bounced','reported_opens','reported_clicks','sent_at_utc','metric_basis'].sort());console.log('Protected aggregate-only report: PASS');
 console.log('Demo share path: /share/'+share.body.token);
}
