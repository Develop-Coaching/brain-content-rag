import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GREG_SYSTEM_PROMPT } from '../../../../../src/agent/voice';
import { getSupabase } from '../../../../lib/supabase';

const PLATFORM_GUIDELINES: Record<string, string> = {
  linkedin_article: 'LinkedIn Article: 500-800 words, long-form deep dive. Include a "description" field with a 1-2 sentence teaser.',
  linkedin_post: 'LinkedIn Post: 150-300 words, shorter punchy take. Include a "description" field with key takeaway.',
  email: 'Email: 200-400 words, conversational letter style. Include a "description" field as the subject line.',
  x: 'X/Twitter: Under 280 chars. Include a "description" field (same as content).',
  instagram_post: 'Instagram Post: 100-200 word caption. Include a "description" field with a hook for the image.',
  instagram_reel: 'Instagram Reel: Spoken script using HOOK: / BODY: / CLOSE: format. Include a "description" field with 80-150 word caption for underneath the reel.',
  carousel: 'Carousel: 5-7 slide titles with descriptions. Include a "description" field summarising the carousel.',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { id } = await params;
  const { instructions } = await request.json();

  // Get the current post
  const { data: post, error: postError } = await supabase
    .from('greg_content_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const platformGuide = PLATFORM_GUIDELINES[post.platform] || 'Write content appropriate for this platform.';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: GREG_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Regenerate this ${post.platform} post (${post.post_type || 'standard'}).

CURRENT CONTENT:
${post.draft_content}

${post.description ? `CURRENT DESCRIPTION/CAPTION:\n${post.description}\n` : ''}
${post.source_context ? `REFERENCE SOURCE MATERIAL (use this as the basis for the content - draw specific details, examples, and talking points from it):\n${post.source_context}\n` : ''}
WHAT NEEDS TO CHANGE:
${instructions}

PLATFORM GUIDELINES: ${platformGuide}

Regenerate the post following the instructions above. Make sure to draw from the reference source material if provided. Also include a graphic_prompt with creative direction for the visual.

FORMATTING: Write all content as plain text. Use line breaks for paragraphs. Do NOT use HTML tags (no <p>, <br>, <strong>, <h2>, etc.). Do NOT use markdown formatting. Just write natural, clean plain text.

Return JSON only:
{ "content": "The new post content...", "description": "The new description/caption...", "graphic_prompt": "Image/visual concept..." }`,
    }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  let newContent: { content: string; description?: string; graphic_prompt?: string };
  try {
    newContent = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    return NextResponse.json({ error: 'Failed to parse regenerated content' }, { status: 500 });
  }

  // Update the post
  const { data: updated, error: updateError } = await supabase
    .from('greg_content_queue')
    .update({
      draft_content: newContent.content || post.draft_content,
      description: newContent.description || post.description,
      graphic_prompt: newContent.graphic_prompt || post.graphic_prompt,
      status: 'draft',
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
