import { NextResponse } from 'next/server'
import { getAdminSupabase, getRequestSupabase } from '@/lib/supabase-server'

const providerBase = process.env.MESSAGING_PROVIDER_BASE_URL!

export async function POST(request: Request) {
  const input = await request.json().catch(() => null)
  if (!input?.brandId || !input?.campaignId || !Array.isArray(input?.recipients) || !input.recipients.length) return NextResponse.json({ error: 'brandId, campaignId, and recipients are required' }, { status: 400 })
  if (input.recipients.length > 100000) return NextResponse.json({ error: 'Recipient limit exceeded' }, { status: 400 })

  const auth = await getRequestSupabase(); const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const { data: member } = await auth.from('brand_members').select('role').eq('user_id', user.id).eq('brand_id', input.brandId).maybeSingle()
  if (member?.role !== 'owner') return NextResponse.json({ error: 'Only brand owners can send campaigns' }, { status: 403 })

  const batchKey = String(input.idempotencyKey || `${input.brandId}:${input.campaignId}:${user.id}:${input.approvedAt || ''}`)
  const admin = getAdminSupabase()
  const { data: existing } = await admin.from('send_batches').select('*').eq('brand_id', input.brandId).eq('batch_key', batchKey).maybeSingle()
  if (existing) return NextResponse.json({ batch: existing, replayed: true })
  const { data: batch, error: insertError } = await admin.from('send_batches').insert({ brand_id: input.brandId, campaign_id: input.campaignId, batch_key: batchKey, approved_recipient_count: input.recipients.length, status: 'sending' }).select().single()
  if (insertError) return NextResponse.json({ error: 'Could not reserve send batch', detail: insertError.message }, { status: 409 })

  try {
    const provider = await fetch(`${providerBase}/v1/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.MESSAGING_PROVIDER_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': batchKey }, body: JSON.stringify({ campaign: input.campaignName || input.campaignId, brand: input.brandName || input.brandId, recipients: input.recipients }) })
    const payload = await provider.json().catch(() => ({}))
    if (!provider.ok) throw new Error(`Provider returned ${provider.status}`)
    const { data: updated } = await admin.from('send_batches').update({ status: 'sent', provider_response: payload }).eq('id', batch.id).select().single()
    return NextResponse.json({ batch: updated, provider: payload })
  } catch (error) {
    await admin.from('send_batches').update({ status: 'failed', provider_response: { error: error instanceof Error ? error.message : 'Unknown provider error' } }).eq('id', batch.id)
    return NextResponse.json({ error: 'Provider send failed; the batch is recorded as failed and is safe to retry', batchId: batch.id }, { status: 502 })
  }
}
