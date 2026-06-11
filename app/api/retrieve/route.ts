import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch } from '../../../src/agent/search';

// External retrieval endpoint for the Post Creator brain connector.
// Auth: x-brain-secret header must match BRAIN_API_SECRET.
export async function POST(request: NextRequest) {
  const secret = process.env.BRAIN_API_SECRET;
  if (!secret || request.headers.get('x-brain-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { query?: unknown; k?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return NextResponse.json({ error: 'No query provided' }, { status: 400 });
  }

  const k = Math.min(Math.max(Number(body.k) || 8, 1), 25);

  try {
    const results = await hybridSearch(query, k);
    return NextResponse.json({
      chunks: results.map((r) => ({
        text: r.content,
        source: r.source_title || r.source_table,
        metadata: {
          source_table: r.source_table,
          framework_tags: r.framework_tags,
          topic_tags: r.topic_tags,
          score: r.combined_score,
        },
      })),
    });
  } catch (err) {
    console.error('[retrieve] search failed:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
