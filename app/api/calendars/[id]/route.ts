import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const { id } = await params;

  // Delete all posts for this calendar first
  const { error: postsError } = await supabase
    .from('greg_content_queue')
    .delete()
    .eq('calendar_id', id);

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 500 });
  }

  // Delete the calendar
  const { error: calError } = await supabase
    .from('greg_monthly_calendars')
    .delete()
    .eq('id', id);

  if (calError) {
    return NextResponse.json({ error: calError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
