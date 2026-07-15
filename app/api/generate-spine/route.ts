import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GREG_SYSTEM_PROMPT, getSeasonalContext, formatMonth } from '../../../src/agent/voice';
import { dayCadence, sanitizeCopy } from '../../../src/agent/cadence';
import { getSupabase } from '../../lib/supabase';

export const maxDuration = 300;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface SpineDay {
  date: string;        // YYYY-MM-DD
  day_of_week: string; // Mon..Sun
  weekday: number;     // 0-6
  heavy: 'reel' | 'carousel';
  spine_topic: string;
  hook: string;
  scamper_lens: string; // only meaningful on heavy days
}

// The 7 calendar dates for a given week-of-month block (days 1-7, 8-14, ...).
function weekDates(month: string, weekNumber: number): { date: string; weekday: number }[] {
  const [year, monthNum] = month.split('-').map(Number);
  const out: { date: string; weekday: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const dayOfMonth = (weekNumber - 1) * 7 + i + 1;
    const d = new Date(Date.UTC(year, monthNum - 1, dayOfMonth));
    // Stop if we've rolled past the target month (short final week).
    if (d.getUTCMonth() !== monthNum - 1) break;
    out.push({ date: d.toISOString().split('T')[0], weekday: d.getUTCDay() });
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const { calendarId, month, weekNumber, theme, instructions } = await request.json();
    if (!month || !weekNumber || !theme) {
      return NextResponse.json({ error: 'Missing required fields (month, weekNumber, theme)' }, { status: 400 });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthDate = new Date(year, monthNum - 1, 1);
    const dates = weekDates(month, weekNumber);
    if (dates.length === 0) {
      return NextResponse.json({ week: weekNumber, theme, weekly_cta: '', days: [] });
    }

    // Ground the spine in Greg's knowledge base for this theme.
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: theme,
    });
    const { data: kbData } = await getSupabase().rpc('match_training_chunks', {
      query_embedding: emb.data[0].embedding,
      match_count: 8,
    });
    const knowledgeBase = (kbData || [])
      .map((r: any) => `[${r.section}] ${(r.chunk_text || '').slice(0, 160)}...`)
      .join('\n\n');

    // Describe each day's slot (date + weekday + which heavy format it carries)
    // so Claude assigns a SCAMPER lens only where a reel/carousel actually runs.
    const slotLines = dates.map(({ date, weekday }, i) => {
      const cad = dayCadence(weekday);
      return `Day ${i + 1} - ${DOW[weekday]} ${date} - heavy format: ${cad.heavy.toUpperCase()}`;
    }).join('\n');

    const instructionsBlock = instructions ? `\nCUSTOM INSTRUCTIONS: ${instructions}` : '';

    const prompt = `You are planning the day-by-day SPINE for one week of Develop Coaching content.

Week ${weekNumber} of ${formatMonth(monthDate)}.
Weekly theme: "${theme}"
SEASONAL CONTEXT: ${getSeasonalContext(monthDate)}${instructionsBlock}

KNOWLEDGE BASE (Greg's own frameworks - ground the topics in these):
${knowledgeBase}

Plan one coherent spine topic per day. Each day, every piece of content (feed posts, article, the heavy format, the X/Threads post) will be written on that day's single spine_topic, opening from its hook. Progress the topics logically across the week so it reads like a deliberate arc, not seven random posts. End the week on a wrap/summary day.

Also choose ONE weekly CTA for the whole week (a specific next step: a named free training, or "book a call"). Match it to where this theme sits in the funnel.

HARD RULES: Audience is UK construction business owners only. Use UK context and GBP. Never reference Australia, AU seasons, or any other country. No em dashes in ANY field. No swearing. The only domain is develop-coaching.com and the only email is hello@develop-coaching.com (never developcoaching.co.uk).

For each day below, give:
- spine_topic: the single subject that day (specific, not generic)
- hook: a scroll-stopping first line in Greg's voice (first person, no em dashes, no swearing)
- scamper_lens: for a REEL or CAROUSEL day, the SCAMPER lens to vary the angle (Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Reverse). Use "" if the day has no heavy format.

The days and their heavy formats:
${slotLines}

Respond in JSON only:
{
  "weekly_cta": "...",
  "days": [
    { "day": 1, "spine_topic": "...", "hook": "...", "scamper_lens": "..." }
  ]
}`;

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: GREG_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    let parsed: { weekly_cta?: string; days?: any[] };
    try {
      parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      return NextResponse.json({ error: 'Failed to parse spine from model' }, { status: 502 });
    }

    const weekly_cta = sanitizeCopy(parsed.weekly_cta || '');
    const days: SpineDay[] = dates.map(({ date, weekday }, i) => {
      const cad = dayCadence(weekday);
      const d = (parsed.days || []).find((x: any) => x.day === i + 1) || {};
      return {
        date,
        day_of_week: cad.label,
        weekday,
        heavy: cad.heavy,
        spine_topic: sanitizeCopy(d.spine_topic || `${theme} day ${i + 1}`),
        hook: sanitizeCopy(d.hook || ''),
        scamper_lens: d.scamper_lens || '',
      };
    });

    const spineWeek = { week: weekNumber, theme, weekly_cta, days };

    // Persist onto the calendar's spine (array indexed by week) if we have one.
    if (calendarId) {
      const supabase = getSupabase();
      const { data: cal } = await supabase
        .from('greg_monthly_calendars')
        .select('spine')
        .eq('id', calendarId)
        .single();
      const existing: any[] = Array.isArray(cal?.spine) ? cal!.spine : [];
      const merged = existing.filter((w: any) => w.week !== weekNumber);
      merged.push(spineWeek);
      merged.sort((a: any, b: any) => a.week - b.week);
      await supabase.from('greg_monthly_calendars').update({ spine: merged }).eq('id', calendarId);
    }

    return NextResponse.json(spineWeek);
  } catch (err) {
    console.error('[generate-spine] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
