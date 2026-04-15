import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GREG_SYSTEM_PROMPT } from '../../../src/agent/voice';

const PLATFORM_INSTRUCTIONS: Record<string, string> = {
  instagram_caption: 'Rewrite as an Instagram caption. 100-200 words. Conversational, direct. Include a call to action.',
  instagram_reel: 'Rewrite as an Instagram Reel script using HOOK: / BODY: / CLOSE: format (80-150 words spoken script). Also write a separate caption (80-150 words) for underneath the reel.',
  linkedin_post: 'Rewrite as a LinkedIn post. 150-300 words. Hook + story + lesson format.',
  linkedin_article: 'Rewrite as a LinkedIn article. 500-800 words. Punchy hook, short paragraphs, soft CTA.',
  email: 'Rewrite as an email. 200-400 words. Conversational letter style, like writing to a mate.',
  x: 'Rewrite for X/Twitter. Under 280 characters. Punchy one-liner.',
  general: 'Rewrite this content keeping it roughly the same length and format, but make it sound like Greg wrote it.',
};

export async function POST(request: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { text, platform } = await request.json();

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 });
  }

  const platformGuide = PLATFORM_INSTRUCTIONS[platform] || PLATFORM_INSTRUCTIONS.general;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: GREG_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Take the following content and rewrite it in Greg's voice and style. Keep the core message and meaning, but make it sound like Greg wrote it naturally.

${platformGuide}

ORIGINAL CONTENT:
${text}

Return JSON only:
{ "reworded": "The rewritten content..." }`,
    }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  let parsed: { reworded?: string };
  try {
    parsed = JSON.parse(responseText.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 });
  }

  if (!parsed.reworded) {
    return NextResponse.json({ error: 'No content returned' }, { status: 500 });
  }

  return NextResponse.json({ reworded: parsed.reworded });
}
