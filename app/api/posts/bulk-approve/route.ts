import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '../../../lib/supabase';

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const { ids } = await request.json();

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('greg_content_queue')
    .update({ status: 'approved' })
    .in('id', ids)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: data?.length || 0 });
}
