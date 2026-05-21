import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklySummary } from '../../../../src/publisher/weekly-summary';

// POST /api/publish/weekly-summary  → sends the Monday digest for the current week
// Optional body: { start: 'YYYY-MM-DD' } to force a specific week start.
export async function POST(request: NextRequest) {
  const secret = process.env.PUBLISHER_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({} as any));
  const start = body.start ? new Date(body.start) : undefined;
  try {
    const result = await sendWeeklySummary(start);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
