import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GREG_SYSTEM_PROMPT, formatMonth } from '../../../src/agent/voice';
import { buildDayPieces, sanitizeCopy } from '../../../src/agent/cadence';
import { getSupabase } from '../../lib/supabase';

export const maxDuration = 300;

interface SpineDay {
  date: string;
  day_of_week: string;
  weekday: number;
  heavy: 'reel' | 'carousel';
  spine_topic: string;
  hook: string;
  scamper_lens: string;
}

// Generate every piece for one day in a single coherent call, then insert.
async function generateDay(opts: {
  anthropic: Anthropic;
  supabase: ReturnType<typeof getSupabase>;
  calendarId: string;
  weekNumber: number;
  theme: string;
  weeklyCta: string;
  monthLabel: string;
  knowledgeBase: string;
  instructions: string | null;
  day: SpineDay;
}): Promise<number> {
  const { anthropic, supabase, calendarId, weekNumber, theme, weeklyCta, monthLabel, knowledgeBase, instructions, day } = opts;

  const pieces = buildDayPieces(day.weekday);
  const pieceList = pieces
    .map((p, i) => `${i + 1}. [platform: ${p.platform}, post_type: ${p.post_type}] ${p.guideline}`)
    .join('\n');

  const lensLine = day.scamper_lens ? `\nSCAMPER lens for the heavy format: ${day.scamper_lens}` : '';
  const instructionsBlock = instructions ? `\nCUSTOM INSTRUCTIONS: ${instructions}` : '';

  const prompt = `Write all of today's Develop Coaching content. Every piece is on ONE topic and opens from the hook.

Week ${weekNumber} of ${monthLabel} - ${day.day_of_week} ${day.date}
Weekly theme: "${theme}"
Today's spine topic: "${day.spine_topic}"
Today's hook: "${day.hook}"
Weekly CTA (weave in naturally, do not force into every piece): "${weeklyCta}"${lensLine}${instructionsBlock}

KNOWLEDGE BASE (Greg's own frameworks):
${knowledgeBase}

Rules: write AS Greg, first person. Audience is UK construction business owners only, never reference Australia or AU seasons. No em dashes anywhere. No swearing. UK spelling and context. Money in GBP. The only domain is develop-coaching.com and the only email is hello@develop-coaching.com (never developcoaching.co.uk). Feed/social posts end on a specific engagement CTA, not "link in bio".

Write these ${pieces.length} pieces, in this order:
${pieceList}

For every piece include a "graphic_prompt" field: creative direction for an on-brand explanatory visual (whiteboard / quote card / illustration / Greg thumbnail), not generic stock.

Respond in JSON only:
{ "pieces": [ { "platform": "...", "post_type": "...", "content": "...", "description": "...", "graphic_prompt": "..." } ] }`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4500,
    system: GREG_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  let generated: any[];
  try {
    generated = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}').pieces || [];
  } catch {
    console.log(`[generate-week] Failed to parse day ${day.date}`);
    return 0;
  }

  let created = 0;
  for (let i = 0; i < generated.length; i++) {
    // Isolate each piece: one bad piece must never drop the rest of the day.
    try {
      const g = generated[i];
      const spec = pieces[i] || {};
      const content = sanitizeCopy(g.content);
      if (!content) continue; // skip empty pieces rather than store a blank row
      const { error } = await supabase.from('greg_content_queue').insert({
        calendar_id: calendarId,
        platform: g.platform || (spec as any).platform,
        post_type: g.post_type || (spec as any).post_type,
        draft_content: content,
        description: g.description ? sanitizeCopy(g.description) : null,
        graphic_prompt: g.graphic_prompt ? sanitizeCopy(g.graphic_prompt) : null,
        scheduled_date: day.date,
        week_number: weekNumber,
        day_of_week: day.day_of_week,
        spine_topic: day.spine_topic,
        hook: day.hook,
        cta: weeklyCta,
        status: 'draft',
      });
      if (error) console.log(`[generate-week] Insert error (${day.date} #${i}):`, error.message);
      else created++;
    } catch (e) {
      console.log(`[generate-week] Piece error (${day.date} #${i}):`, e instanceof Error ? e.message : e);
    }
  }
  return created;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const { calendarId, month, weekNumber, theme, instructions, spine } = await request.json();

    if (!calendarId || !month || !weekNumber || !theme) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Resolve the week's spine: from the request, else from the stored calendar.
    let spineWeek: { weekly_cta?: string; days?: SpineDay[] } | null =
      spine && Array.isArray(spine.days) ? spine : null;

    if (!spineWeek) {
      const { data: cal } = await supabase
        .from('greg_monthly_calendars')
        .select('spine')
        .eq('id', calendarId)
        .single();
      const stored: any[] = Array.isArray(cal?.spine) ? cal!.spine : [];
      spineWeek = stored.find((w: any) => w.week === weekNumber) || null;
    }

    if (!spineWeek || !spineWeek.days || spineWeek.days.length === 0) {
      return NextResponse.json({ error: 'No spine for this week - generate the day plan first' }, { status: 400 });
    }

    const monthLabel = formatMonth(new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1, 1));
    const weeklyCta = spineWeek.weekly_cta || '';

    // One shared knowledge-base pull for the whole week.
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: theme,
    });
    const { data: kbData } = await supabase.rpc('match_training_chunks', {
      query_embedding: emb.data[0].embedding,
      match_count: 10,
    });
    const knowledgeBase = (kbData || [])
      .map((r: any) => `[${r.section}] ${(r.chunk_text || '').slice(0, 150)}...`)
      .join('\n\n');

    // Generate all days in parallel (bounded to 7), each a coherent single call.
    const results = await Promise.all(
      spineWeek.days.map(day =>
        generateDay({
          anthropic, supabase, calendarId, weekNumber, theme,
          weeklyCta, monthLabel, knowledgeBase,
          instructions: (instructions || '').trim() || null,
          day,
        }).catch(err => {
          console.error(`[generate-week] Day ${day.date} failed:`, err);
          return 0;
        }),
      ),
    );

    const postsCreated = results.reduce((sum, n) => sum + n, 0);
    console.log(`[generate-week] Week ${weekNumber} complete: ${postsCreated} posts across ${spineWeek.days.length} days`);
    return NextResponse.json({ postsCreated });
  } catch (err) {
    console.error('[generate-week] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
