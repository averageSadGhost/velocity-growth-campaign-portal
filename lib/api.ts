import {getRequestSupabase} from './supabase-server';
export async function identity(request:Request){
 const db=await getRequestSupabase(request),{data:{user},error}=await db.auth.getUser();
 if(error||!user) throw new Error('Unauthorized');
 const {data:members,error:e}=await db.from('brand_members').select('brand_id,role').eq('user_id',user.id);
 if(e||!members?.length) throw new Error('Forbidden');
 return {db,user,members};
}
export function failure(error:unknown){
 const message=error instanceof Error?error.message:'Request failed';
 return Response.json({error:message},{status:message==='Unauthorized'?401:message==='Forbidden'?403:400,headers:{'Cache-Control':'no-store'}});
}
