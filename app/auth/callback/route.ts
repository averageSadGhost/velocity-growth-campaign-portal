import { getRequestSupabase } from "@/lib/supabase-server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await getRequestSupabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL("/", url.origin), 303);
  }
  return Response.redirect(new URL("/?auth_error=1", url.origin), 303);
}
