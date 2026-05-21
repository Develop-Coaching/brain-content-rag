import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../../lib/supabase';

// Hit by the manual "Mark posted" button (UI + Slack).
// Body (optional): { published_url?: string, posted_by?: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await params;
  const body = await request.json().catch(() => ({} as any));

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('greg_content_queue')
    .update({
      status: 'published',
      publish_mode: 'manual',
      published_at: now,
      posted_manually_at: now,
      published_url: body.published_url ?? null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from('greg_publish_log').insert({
    queue_id: id,
    platform: data.platform,
    mode: 'manual_slack',
    success: true,
    external_url: body.published_url ?? null,
    error_message: body.posted_by ? `marked posted by ${body.posted_by}` : null,
  });

  return NextResponse.json({ ok: true, post: data });
}
