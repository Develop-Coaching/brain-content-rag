import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const param = request.nextUrl.searchParams.get('month');
  if (!param) {
    return NextResponse.json({ error: 'month parameter required' }, { status: 400 });
  }

  let calendar: any = null;

  // Check if the param is a UUID (calendar ID) or a month string (YYYY-MM)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

  if (isUuid) {
    const { data } = await supabase
      .from('greg_monthly_calendars')
      .select('*')
      .eq('id', param)
      .single();
    calendar = data;
  } else {
    // Legacy: treat as YYYY-MM month string
    const [year, monthNum] = param.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1).toISOString().split('T')[0];
    const monthEnd = new Date(year, monthNum, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('greg_monthly_calendars')
      .select('*')
      .gte('month', monthStart)
      .lte('month', monthEnd)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();
    calendar = data;
  }

  if (!calendar) {
    return NextResponse.json({ calendar: null, posts: [] });
  }

  // Get all posts for this calendar
  const { data: posts } = await supabase
    .from('greg_content_queue')
    .select('*')
    .eq('calendar_id', calendar.id)
    .order('scheduled_date', { ascending: true });

  return NextResponse.json({
    calendar,
    posts: posts || [],
  });
}
