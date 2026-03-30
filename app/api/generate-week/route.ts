import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GREG_SYSTEM_PROMPT, getSeasonalContext, formatMonth } from '../../../src/agent/voice';
import { getSupabase } from '../../lib/supabase';

export const maxDuration = 120; // 2 minutes per week — plenty

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

    const { calendarId, month, weekNumber, theme, instructions, fileContent, fileName, contentMix } = await request.json();

    if (!calendarId || !month || !weekNumber || !theme) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const monthDate = new Date(year, monthNum - 1, 1);
    const monthStart = new Date(year, monthNum - 1, 1);

    const defaultMix = {
      linkedin_article: 1, linkedin_post: 1, email: 1, x: 1,
      instagram_post: 1, instagram_reel: 1, carousel: 1,
    };
    const mix = contentMix || defaultMix;
    const postCount = Object.values(mix).reduce((sum: number, n: any) => sum + (n as number), 0);

    if (postCount === 0) {
      return NextResponse.json({ postsCreated: 0 });
    }

    // Quick knowledge base search
    const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: 'business planning cashflow pricing scaling leads architects subcontractors' });
    const { data: kbData } = await supabase.rpc('match_training_chunks', {
      query_embedding: emb.data[0].embedding,
      match_count: 15,
    });
    const knowledgeBase = (kbData || []).map((r: any) => `[${r.section}] ${(r.chunk_text || '').slice(0, 200)}...`).join('\n\n');

    // Build prompt
    let referenceSection = `KNOWLEDGE BASE CONTENT TO DRAW FROM:\n${knowledgeBase}`;
    if (fileContent) {
      const truncatedFile = fileContent.slice(0, 6000);
      referenceSection += `\n\nREFERENCE FILE (${fileName}):\nUse this file as primary source material. Draw specific examples, frameworks, and ideas from it.\n\n${truncatedFile}${fileContent.length > 6000 ? '\n\n[...file truncated]' : ''}`;
    }

    const instructionsBlock = instructions
      ? `\n\nCUSTOM INSTRUCTIONS (MUST FOLLOW):\n${instructions}\nThese instructions override defaults. Follow them exactly.`
      : '';

    const postListPrompt = buildPostList(mix);
    const maxTokens = Math.min(16000, Math.max(4000, postCount * 1500));

    const weekRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: GREG_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate content for Week ${weekNumber} of ${formatMonth(monthDate)}.
Theme: "${theme}"${instructionsBlock}

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

    let postsCreated = 0;
    const sourceContext = fileContent ? fileContent.slice(0, 4000) : null;

    for (const post of weekPosts) {
      const dayOffset = (weekNumber - 1) * 7 + ((post.scheduled_day || 1) - 1);
      const scheduledDate = new Date(monthStart);
      scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

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
        console.log('[generate-week] Insert error:', error.message);
      } else {
        postsCreated++;
      }
    }

    console.log(`[generate-week] Week ${weekNumber} done: ${postsCreated} posts`);
    return NextResponse.json({ postsCreated });
  } catch (err) {
    console.error('[generate-week] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
