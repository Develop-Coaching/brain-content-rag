import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GREG_SYSTEM_PROMPT, getSeasonalContext, formatMonth } from '../../../src/agent/voice';
import { getSupabase } from '../../lib/supabase';

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
  const supabase = getSupabase();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  async function quickSearch(query: string, limit: number = 5) {
    const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
    const { data } = await supabase.rpc('match_training_chunks', {
      query_embedding: emb.data[0].embedding,
      match_count: limit,
    });
    return (data || []).map((r: any) => `[${r.section}] ${(r.chunk_text || '').slice(0, 200)}...`).join('\n\n');
  }
  const body = await request.json();
  console.log('[generate] Request body:', JSON.stringify({ month: body.month, weekCount: body.weeks?.length }));
  const { month, weeks: weekConfigs } = body;

  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

  const [year, monthNum] = month.split('-').map(Number);
  const monthDate = new Date(year, monthNum - 1, 1);
  const seasonalContext = getSeasonalContext(monthDate);

  const knowledgeBase = await quickSearch('business planning cashflow pricing scaling leads architects subcontractors', 15);

  // Build week themes - mix of auto and custom
  const configs = weekConfigs || [
    { week: 1, mode: 'auto' }, { week: 2, mode: 'auto' },
    { week: 3, mode: 'auto' }, { week: 4, mode: 'auto' },
  ];

  const customThemes = configs.filter((w: any) => w.mode === 'custom' && w.theme).map((w: any) => w.theme);
  const autoCount = configs.filter((w: any) => w.mode === 'auto').length;

  // Generate auto themes if needed
  let autoThemes: { theme: string; description: string }[] = [];
  if (autoCount > 0) {
    const existingContext = customThemes.length > 0
      ? `\n\nThe following custom themes are already set for other weeks:\n${customThemes.map((t: string) => `- ${t}`).join('\n')}\nMake sure your themes complement these and don't overlap.`
      : '';

    const themesRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: GREG_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate ${autoCount} weekly content themes for ${formatMonth(monthDate)}.\n\nSEASONAL CONTEXT: ${seasonalContext}${existingContext}\n\nRespond in JSON only:\n{ "themes": [{ "theme": "Theme Name", "description": "One sentence description" }] }`,
      }],
    });
    const themesText = themesRes.content[0].type === 'text' ? themesRes.content[0].text : '';
    autoThemes = JSON.parse(themesText.match(/\{[\s\S]*\}/)?.[0] || '{"themes":[]}').themes || [];
  }

  // Assemble final week themes (with file content if provided)
  let autoIdx = 0;
  const weekThemes = configs.map((w: any) => {
    if (w.mode === 'custom' && w.theme) {
      return { week: w.week, theme: w.theme, description: w.theme, instructions: w.instructions || null, fileContent: w.fileContent || null, fileName: w.fileName || null };
    } else {
      const auto = autoThemes[autoIdx++] || { theme: 'Content Week', description: '' };
      return { week: w.week, theme: auto.theme, description: auto.description, instructions: null, fileContent: null, fileName: null };
    }
  });

  // Create calendar
  const { data: calendarData, error: calendarError } = await supabase
    .from('greg_monthly_calendars')
    .insert({
      month: `${year}-${String(monthNum).padStart(2, '0')}-01`,
      themes: weekThemes.map((w: any) => w.theme),
      status: 'draft',
    })
    .select('id')
    .single();

  if (calendarError) return NextResponse.json({ error: calendarError.message }, { status: 500 });
  const calendarId = calendarData.id;

  // Generate each week's posts
  const monthStart = new Date(year, monthNum - 1, 1);
  let totalPosts = 0;

  for (const weekTheme of weekThemes) {
    // Build reference material section
    let referenceSection = `KNOWLEDGE BASE CONTENT TO DRAW FROM:\n${knowledgeBase}`;
    if (weekTheme.fileContent) {
      // Truncate file content to ~6000 chars to leave room for the rest of the prompt
      const truncatedFile = weekTheme.fileContent.slice(0, 6000);
      referenceSection += `\n\nREFERENCE FILE (${weekTheme.fileName}):\nUse this file as primary source material for this week's content. Draw specific examples, frameworks, and ideas from it.\n\n${truncatedFile}${weekTheme.fileContent.length > 6000 ? '\n\n[...file truncated]' : ''}`;
    }

    const instructionsBlock = weekTheme.instructions
      ? `\n\nCUSTOM INSTRUCTIONS (MUST FOLLOW):\n${weekTheme.instructions}\nThese instructions override defaults. Follow them exactly.`
      : '';

    const weekRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: GREG_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate content for Week ${weekTheme.week} of ${formatMonth(monthDate)}.
Theme: "${weekTheme.theme}" - ${weekTheme.description}${instructionsBlock}

${referenceSection}

Generate exactly 8 posts for this week:
1. LinkedIn Article (platform: "linkedin_article") - 500-800 words, long-form deep dive
2. LinkedIn Post (platform: "linkedin_post") - 150-300 words, shorter punchy take
3. Email (platform: "email") - 200-400 words, conversational letter style
4. X/Twitter (platform: "x") - under 280 chars
5. Instagram Post (platform: "instagram_post") - 100-200 word caption
6. Instagram Reel (platform: "instagram_reel") - spoken script using HOOK: / BODY: / CLOSE: format
7. Carousel (platform: "carousel") - 5-7 slide titles with descriptions
8. One extra post on whichever platform fits best

IMPORTANT: Every single post MUST include a "description" field:
- LinkedIn Article: 1-2 sentence teaser/summary
- LinkedIn Post: 1 sentence summary of the key takeaway
- Email: Subject line for the email
- X/Twitter: Not needed (set description to same as content)
- Instagram Post: 1 sentence hook for the image overlay
- Instagram Reel: 80-150 word caption to appear underneath the reel on Instagram
- Carousel: 1 sentence description of what the carousel covers
- Extra post: appropriate description for its platform

ALSO: For every post, include a "graphic_prompt" field - a brief creative direction for the visual/graphic to accompany the post. Describe what the image or graphic should look like: style, colours, text overlay, photo type, or illustration concept. Be specific enough that a designer or AI image tool could create it. For reels, describe the thumbnail.

Spread scheduled_day values 1-7 across the week.

FORMATTING: Write all content as plain text. Use line breaks for paragraphs. Do NOT use HTML tags (no <p>, <br>, <strong>, <h2>, etc.). Do NOT use markdown formatting. Just write natural, clean plain text.

Respond in JSON only:
{ "posts": [{ "platform": "linkedin_article", "post_type": "deep_dive", "content": "Full content...", "description": "Description...", "graphic_prompt": "Image concept...", "scheduled_day": 1 }] }`,
      }],
    });

    const weekText = weekRes.content[0].type === 'text' ? weekRes.content[0].text : '';
    let weekPosts: any[];
    try {
      weekPosts = JSON.parse(weekText.match(/\{[\s\S]*\}/)?.[0] || '{}').posts || [];
    } catch {
      weekPosts = [];
    }

    for (const post of weekPosts) {
      const dayOffset = (weekTheme.week - 1) * 7 + ((post.scheduled_day || 1) - 1);
      const scheduledDate = new Date(monthStart);
      scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

      // Store truncated file content so regenerate can use it
      const sourceContext = weekTheme.fileContent
        ? weekTheme.fileContent.slice(0, 4000)
        : null;

      const { error } = await supabase.from('greg_content_queue').insert({
        calendar_id: calendarId,
        platform: post.platform,
        post_type: post.post_type,
        draft_content: post.content,
        description: post.description || null,
        graphic_prompt: post.graphic_prompt || null,
        source_context: sourceContext,
        scheduled_date: scheduledDate.toISOString().split('T')[0],
        status: 'draft',
      });

      if (error) {
        console.log('[generate] Insert error:', error.message);
      } else {
        totalPosts++;
      }
    }
    console.log('[generate] Week done, total posts so far:', totalPosts);
  }

  console.log('[generate] Complete:', totalPosts, 'posts');
  return NextResponse.json({
    calendarId,
    postsCreated: totalPosts,
    themes: weekThemes.map((w: any) => w.theme),
    reviewUrl: `/content/review/${month}`,
  });
  } catch (err) {
    console.error('[generate] CRASH:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
