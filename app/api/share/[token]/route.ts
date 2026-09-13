import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";

async function hashPassword(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const input = await request.json().catch(() => null);
  if (typeof input?.password !== "string") return NextResponse.json({ error: "Password is required" }, { status: 400 });
  const admin = getAdminSupabase();
  const { data: share } = await admin.from("share_links").select("brand_id,campaign_id,password_hash,revoked_at").eq("token", token).maybeSingle();
  if (!share || share.revoked_at || (await hashPassword(input.password)) !== share.password_hash) return NextResponse.json({ error: "Invalid link or password" }, { status: 401 });
  const { data: campaign, error } = await admin.from("campaigns").select("campaign_name,channel,reported_sent,reported_delivered,reported_bounced,reported_opens,reported_clicks,sent_at_utc").eq("id", share.campaign_id).eq("brand_id", share.brand_id).single();
  if (error || !campaign) return NextResponse.json({ error: "Campaign results are unavailable" }, { status: 404 });
  return NextResponse.json({ campaign });
}
