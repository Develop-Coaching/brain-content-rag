import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month');
  if (!month) {
    return NextResponse.json({ error: 'month parameter required' }, { status: 400 });
  }

  // Parse month param (YYYY-MM)
  const [year, monthNum] = month.split('-').map(Number);
  const monthStart = new Date(year, monthNum - 1, 1).toISOString().split('T')[0];
  const monthEnd = new Date(year, monthNum, 0).toISOString().split('T')[0];

  // Get calendar for this month
  const { data: calendar } = await supabase
    .from('greg_monthly_calendars')
    .select('*')
    .gte('month', monthStart)
    .lte('month', monthEnd)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

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
