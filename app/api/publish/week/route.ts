import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';

// GET /api/publish/week?start=YYYY-MM-DD
// Returns posts for the 7 days starting at `start` (defaults to current week's Monday).
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const startParam = request.nextUrl.searchParams.get('start');
  const start = startParam ? new Date(startParam) : mondayOf(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const { data, error } = await supabase
    .from('greg_content_queue')
    .select('*')
    .gte('scheduled_date', start.toISOString().slice(0, 10))
    .lt('scheduled_date', end.toISOString().slice(0, 10))
    .order('scheduled_time', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    week_start: start.toISOString().slice(0, 10),
    week_end: end.toISOString().slice(0, 10),
    posts: data || [],
  });
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0 Sun .. 6 Sat
  const diff = (day + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}
