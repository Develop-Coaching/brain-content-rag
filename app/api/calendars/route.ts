import { NextResponse } from 'next/server';
import { getSupabase } from '../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabase();

  const { data: calendars } = await supabase
    .from('greg_monthly_calendars')
    .select('id, month, themes, status, generated_at')
    .order('month', { ascending: false })
    .limit(12);

  const calendarIds = calendars?.map((c) => c.id) || [];
  const { data: posts } = calendarIds.length
    ? await supabase
        .from('greg_content_queue')
        .select('calendar_id, status')
        .in('calendar_id', calendarIds)
    : { data: [] };

  const postCounts: Record<string, { total: number; draft: number; approved: number }> = {};
  for (const p of posts || []) {
    if (!postCounts[p.calendar_id]) postCounts[p.calendar_id] = { total: 0, draft: 0, approved: 0 };
    postCounts[p.calendar_id].total++;
    if (p.status === 'draft') postCounts[p.calendar_id].draft++;
    if (p.status === 'approved') postCounts[p.calendar_id].approved++;
  }

  return NextResponse.json({ calendars: calendars || [], postCounts });
}
