import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GREG_SYSTEM_PROMPT, getSeasonalContext, formatMonth } from '../../../src/agent/voice';
import { getSupabase } from '../../lib/supabase';

export const maxDuration = 300; // 5 minutes

const PLATFORM_GUIDELINES: Record<string, string> = {
  linkedin_article: 'LinkedIn Article: 500-800 words, long-form deep dive. Include a "description" field with a 1-2 sentence teaser.',
  linkedin_post: 'LinkedIn Post: 150-300 words, shorter punchy take. Include a "description" field with key takeaway.',
  email: 'Email: 200-400 words, conversational letter style. Include a "description" field as the subject line.',
  x: 'X/Twitter: Under 280 chars. Include a "description" field (same as content).',
  instagram_post: 'Instagram Post: 100-200 word caption. Include a "description" field with a hook for the image overlay.',
  instagram_reel: 'Instagram Reel: Spoken script using HOOK: / BODY: / CLOSE: format. Include a "description" field with 80-150 word caption for underneath the reel.',
  carousel: 'Carousel: 5-7 slide titles with descriptions. Include a "description" field summarising the carousel.',
};

function buildPostList(contentMix: Record<string, number>): string {
  const lines: string[] = [];
  let num = 1;
  for (const [platform, count] of Object.entries(contentMix)) {
    if (count <= 0) continue;
    const guideline = PLATFORM_GUIDELINES[platform] || `${platform}: Write appropriate content for this platform.`;
    if (count === 1) {
      lines.push(`${num}. ${guideline}`);
      num++;
    } else {
      for (let i = 0; i < count; i++) {
        lines.push(`${num}. ${guideline} (variation ${i + 1} of ${count} — each must have a unique angle)`);
        num++;
      }
    }
  }
  return lines.join('\n');
}

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
  const defaultMix = {
    linkedin_article: 1, linkedin_post: 1, email: 1, x: 1,
    instagram_post: 1, instagram_reel: 1, carousel: 1,
  };

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

  // Assemble final week themes (with file content and content mix if provided)
  let autoIdx = 0;
  const weekThemes = configs.map((w: any) => {
    const contentMix = w.contentMix || defaultMix;
    if (w.mode === 'custom' && w.theme) {
      return { week: w.week, theme: w.theme, description: w.theme, instructions: w.instructions || null, fileContent: w.fileContent || null, fileName: w.fileName || null, contentMix };
    } else {
      const auto = autoThemes[autoIdx++] || { theme: 'Content Week', description: '' };
      return { week: w.week, theme: auto.theme, description: auto.description, instructions: null, fileContent: null, fileName: null, contentMix };
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
    const postCount = Object.values(weekTheme.contentMix).reduce((sum: number, n: any) => sum + (n as number), 0);
    if (postCount === 0) continue;

    // Build reference material section
    let referenceSection = `KNOWLEDGE BASE CONTENT TO DRAW FROM:\n${knowledgeBase}`;
    if (weekTheme.fileContent) {
      const truncatedFile = weekTheme.fileContent.slice(0, 6000);
      referenceSection += `\n\nREFERENCE FILE (${weekTheme.fileName}):\nUse this file as primary source material for this week's content. Draw specific examples, frameworks, and ideas from it.\n\n${truncatedFile}${weekTheme.fileContent.length > 6000 ? '\n\n[...file truncated]' : ''}`;
    }

    const instructionsBlock = weekTheme.instructions
      ? `\n\nCUSTOM INSTRUCTIONS (MUST FOLLOW):\n${weekTheme.instructions}\nThese instructions override defaults. Follow them exactly.`
      : '';

    const postListPrompt = buildPostList(weekTheme.contentMix);

    // Scale max_tokens based on post count
    const maxTokens = Math.min(16000, Math.max(4000, postCount * 1500));

    const weekRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: GREG_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate content for Week ${weekTheme.week} of ${formatMonth(monthDate)}.
Theme: "${weekTheme.theme}" - ${weekTheme.description}${instructionsBlock}

${referenceSection}

Generate exactly ${postCount} posts for this week:
${postListPrompt}

ALSO: For every post, include a "graphic_prompt" field - a brief creative direction for the visual/graphic to accompany the post. Describe what the image or graphic should look like: style, colours, text overlay, photo type, or illustration concept. Be specific enough that a designer or AI image tool could create it. For reels, describe the thumbnail.

Spread scheduled_day values 1-7 across the week.

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
