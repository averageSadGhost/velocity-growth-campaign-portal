import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/supabase-server'

export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const secret = request.headers.get('x-webhook-secret')
  if (!process.env.PROVIDER_WEBHOOK_SECRET || secret !== process.env.PROVIDER_WEBHOOK_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!Array.isArray(body?.events)) return NextResponse.json({ error: 'events array is required' }, { status: 400 })
  const admin = getAdminSupabase(); const { data: batch } = await admin.from('send_batches').select('brand_id,campaign_id').eq('id', batchId).single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  const rows = body.events.filter((event: any) => event?.event_id && event?.external_contact_id && event?.event_type).map((event: any) => ({ brand_id: batch.brand_id, event_id: event.event_id, external_contact_id: event.external_contact_id, campaign_external_id: event.campaign_external_id || '', event_type: event.event_type, channel: event.channel || null, occurred_at_utc: event.occurred_at_utc || new Date().toISOString() }))
  const { error } = await admin.from('provider_events').upsert(rows, { onConflict: 'brand_id,event_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accepted: rows.length })
}
