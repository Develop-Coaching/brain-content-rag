import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GREG_SYSTEM_PROMPT, getSeasonalContext, formatMonth } from '../../../src/agent/voice';
import { getSupabase } from '../../lib/supabase';

export const maxDuration = 300;

const PLATFORM_GUIDELINES: Record<string, string> = {
  linkedin_article: 'LinkedIn Article: 500-800 words, long-form deep dive. Include a "description" field with a 1-2 sentence teaser.',
  linkedin_post: 'LinkedIn Post: 150-300 words, shorter punchy take. Include a "description" field with key takeaway.',
  email: 'Email: 200-400 words, conversational letter style. Include a "description" field as the subject line.',
  x: 'X/Twitter: Under 280 chars. Include a "description" field (same as content).',
  instagram_post: 'Instagram Post: 100-200 word caption. Include a "description" field with a hook for the image overlay.',
  instagram_reel: 'Instagram Reel: Spoken script using HOOK: / BODY: / CLOSE: format. Include a "description" field with 80-150 word caption for underneath the reel.',
  carousel: 'Carousel: 5-7 slide titles with descriptions. Include a "description" field summarising the carousel.',
};

// Build a flat list of posts to generate from the content mix
function buildPostEntries(contentMix: Record<string, number>): { platform: string; guideline: string }[] {
  const entries: { platform: string; guideline: string }[] = [];
  for (const [platform, count] of Object.entries(contentMix)) {
    if (count <= 0) continue;
    const guideline = PLATFORM_GUIDELINES[platform] || `${platform}: Write appropriate content for this platform.`;
    for (let i = 0; i < count; i++) {
      const suffix = count > 1 ? ` (variation ${i + 1} of ${count} — unique angle)` : '';
      entries.push({ platform, guideline: guideline + suffix });
    }
  }
  return entries;
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
    const allEntries = buildPostEntries(mix);

    if (allEntries.length === 0) {
      return NextResponse.json({ postsCreated: 0 });
    }

    // Knowledge base search
    console.log(`[generate-week] Week ${weekNumber}: ${allEntries.length} posts in ${Math.ceil(allEntries.length / 3)} batches`);
    const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: 'business planning cashflow pricing scaling leads architects subcontractors' });
    const { data: kbData } = await supabase.rpc('match_training_chunks', {
      query_embedding: emb.data[0].embedding,
      match_count: 10,
    });
    const knowledgeBase = (kbData || []).map((r: any) => `[${r.section}] ${(r.chunk_text || '').slice(0, 150)}...`).join('\n\n');

    // Build reference section
    let referenceSection = `KNOWLEDGE BASE:\n${knowledgeBase}`;
    if (fileContent) {
      const truncatedFile = fileContent.slice(0, 4000);
      referenceSection += `\n\nREFERENCE FILE (${fileName}):\n${truncatedFile}${fileContent.length > 4000 ? '\n[...truncated]' : ''}`;
    }

    const instructionsBlock = instructions
      ? `\nCUSTOM INSTRUCTIONS: ${instructions}`
      : '';

    // Generate in batches of 3 posts max
    const BATCH_SIZE = 3;
    let postsCreated = 0;
    const sourceContext = fileContent ? fileContent.slice(0, 4000) : null;

    for (let batchStart = 0; batchStart < allEntries.length; batchStart += BATCH_SIZE) {
      const batch = allEntries.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      console.log(`[generate-week] Week ${weekNumber} batch ${batchNum}: ${batch.map(b => b.platform).join(', ')}`);

      const postList = batch.map((entry, i) => `${i + 1}. ${entry.guideline}`).join('\n');

      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: batch.length * 1500,
        system: GREG_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Generate ${batch.length} posts for Week ${weekNumber} of ${formatMonth(monthDate)}.
Theme: "${theme}"${instructionsBlock}

${referenceSection}

${postList}

For every post include a "graphic_prompt" field with creative direction for the visual.

Spread scheduled_day values across days ${batchStart + 1}-${batchStart + batch.length}.

Respond in JSON only:
{ "posts": [{ "platform": "...", "post_type": "...", "content": "...", "description": "...", "graphic_prompt": "...", "scheduled_day": ${batchStart + 1} }] }`,
        }],
      });

      console.log(`[generate-week] Week ${weekNumber} batch ${batchNum} response received`);
      const text = res.content[0].type === 'text' ? res.content[0].text : '';
      let posts: any[];
      try {
        posts = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}').posts || [];
      } catch {
        console.log(`[generate-week] Failed to parse batch ${batchNum}`);
        posts = [];
      }

      for (const post of posts) {
        const dayOffset = (weekNumber - 1) * 7 + ((post.scheduled_day || batchStart + 1) - 1);
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
    }

    console.log(`[generate-week] Week ${weekNumber} complete: ${postsCreated} posts`);
    return NextResponse.json({ postsCreated });
  } catch (err) {
    console.error('[generate-week] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
