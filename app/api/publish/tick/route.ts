import { NextResponse } from 'next/server';
import { publishTick } from '../../../../src/publisher/dispatcher';

// Cron-callable. Hit every 5 minutes.
// Auth: simple bearer token via PUBLISHER_CRON_SECRET (matches header `Authorization: Bearer ...`).
export async function POST(request: Request) {
  const secret = process.env.PUBLISHER_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await publishTick();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: 'POST to run a publish tick. Set PUBLISHER_CRON_SECRET and pass Authorization: Bearer <secret>.',
  });
}
