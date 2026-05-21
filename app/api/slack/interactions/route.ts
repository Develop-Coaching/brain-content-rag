// Slack interactivity endpoint. Configure this URL in your Slack app's
// "Interactivity & Shortcuts" → Request URL.
//
// Handles:
//   - "Mark posted" button (action_id: mark_posted, value: <queue_id>)
//   - "Approve all" button on the Monday weekly digest (action_id: approve_all_week, value: <batch_id>)
//   - Per-post approve/reject buttons in the digest (action_id: approve_one|reject_one, value: <queue_id>)
//
// Slack signing-secret verification: SLACK_SIGNING_SECRET. Falls open in dev if unset.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getSupabase } from '../../../lib/supabase';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySlackSignature(request, rawBody)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  // Slack sends form-encoded with a `payload` field of JSON
  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get('payload');
  if (!payloadRaw) return NextResponse.json({ error: 'no payload' }, { status: 400 });

  const payload = JSON.parse(payloadRaw);
  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ ok: true });

  const userTag = `slack:${payload.user?.id ?? 'unknown'}`;
  const supabase = getSupabase();

  switch (action.action_id) {
    case 'mark_posted': {
      const id = action.value as string;
      const now = new Date().toISOString();
      await supabase
        .from('greg_content_queue')
        .update({
          status: 'published',
          publish_mode: 'manual',
          published_at: now,
          posted_manually_at: now,
        })
        .eq('id', id);
      await supabase.from('greg_publish_log').insert({
        queue_id: id,
        platform: 'unknown',
        mode: 'manual_slack',
        success: true,
        error_message: `marked posted by ${userTag}`,
      });
      return NextResponse.json({ text: '✅ Marked posted.', replace_original: false });
    }

    case 'approve_one': {
      const id = action.value as string;
      await supabase
        .from('greg_content_queue')
        .update({ status: 'scheduled' })
        .eq('id', id);
      return NextResponse.json({ text: 'Approved.', replace_original: false });
    }

    case 'reject_one': {
      const id = action.value as string;
      await supabase
        .from('greg_content_queue')
        .update({ status: 'draft', chloe_notes: `Rejected via Slack ${userTag}` })
        .eq('id', id);
      return NextResponse.json({ text: 'Sent back to draft.', replace_original: false });
    }

    case 'approve_all_week': {
      const batchId = action.value as string;
      const { data: batch } = await supabase
        .from('greg_weekly_batches')
        .select('post_ids')
        .eq('id', batchId)
        .single();

      if (!batch?.post_ids?.length) {
        return NextResponse.json({ text: 'Batch not found.' });
      }

      await supabase
        .from('greg_content_queue')
        .update({ status: 'scheduled' })
        .in('id', batch.post_ids);

      await supabase
        .from('greg_weekly_batches')
        .update({ approved_at: new Date().toISOString(), approved_by: userTag })
        .eq('id', batchId);

      return NextResponse.json({
        text: `✅ Approved ${batch.post_ids.length} posts for the week.`,
        replace_original: false,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

function verifySlackSignature(request: NextRequest, body: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true; // dev mode fall-open

  const ts = request.headers.get('x-slack-request-timestamp');
  const sig = request.headers.get('x-slack-signature');
  if (!ts || !sig) return false;

  // Reject anything older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false;

  const base = `v0:${ts}:${body}`;
  const hmac = crypto.createHmac('sha256', secret).update(base).digest('hex');
  const expected = `v0=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
