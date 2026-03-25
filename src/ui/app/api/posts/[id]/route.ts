import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) updates.status = body.status;
  if (body.draft_content !== undefined) updates.draft_content = body.draft_content;
  if (body.chloe_notes !== undefined) updates.chloe_notes = body.chloe_notes;
  if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date;

  // Handle rejection: set status back to draft with notes
  if (body.status === 'rejected') {
    updates.status = 'draft';
  }

  const { data, error } = await supabase
    .from('greg_content_queue')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
