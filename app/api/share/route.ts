import { NextResponse } from "next/server";
import { getRequestSupabase } from "@/lib/supabase-server";

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input?.brandId || !input?.campaignId || typeof input.password !== "string" || input.password.length < 8) return NextResponse.json({ error: "brandId, campaignId, and an 8-character password are required" }, { status: 400 });
  const supabase = await getRequestSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: member } = await supabase.from("brand_members").select("role").eq("user_id", user.id).eq("brand_id", input.brandId).maybeSingle();
  if (member?.role !== "owner") return NextResponse.json({ error: "Only brand owners can create share links" }, { status: 403 });
  const { data, error } = await supabase.from("share_links").insert({ brand_id: input.brandId, campaign_id: input.campaignId, password_hash: await hashPassword(input.password), created_by: user.id }).select("token").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token: data.token });
}
