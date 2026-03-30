import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../lib/supabase';

// Creates the calendar only — no content generation
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const { month, themes } = await request.json();

    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

    const [year, monthNum] = month.split('-').map(Number);

    const { data, error } = await supabase
      .from('greg_monthly_calendars')
      .insert({
        month: `${year}-${String(monthNum).padStart(2, '0')}-01`,
        themes: themes || [],
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ calendarId: data.id });
  } catch (err) {
    console.error('[generate] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
