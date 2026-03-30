import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { GREG_SYSTEM_PROMPT, getSeasonalContext, formatMonth } from '../../../src/agent/voice';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { month, weeks } = await request.json();

    if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 });

    const [year, monthNum] = month.split('-').map(Number);
    const monthDate = new Date(year, monthNum - 1, 1);
    const seasonalContext = getSeasonalContext(monthDate);

    const customThemes = (weeks || [])
      .filter((w: any) => w.mode === 'custom' && w.theme)
      .map((w: any) => w.theme);
    const autoCount = (weeks || []).filter((w: any) => w.mode === 'auto').length;

    if (autoCount === 0) {
      return NextResponse.json({ themes: [] });
    }

    const existingContext = customThemes.length > 0
      ? `\n\nThe following custom themes are already set for other weeks:\n${customThemes.map((t: string) => `- ${t}`).join('\n')}\nMake sure your themes complement these and don't overlap.`
      : '';

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: GREG_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate ${autoCount} weekly content themes for ${formatMonth(monthDate)}.\n\nSEASONAL CONTEXT: ${seasonalContext}${existingContext}\n\nRespond in JSON only:\n{ "themes": [{ "theme": "Theme Name", "description": "One sentence description" }] }`,
      }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    const themes = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{"themes":[]}').themes || [];

    return NextResponse.json({ themes });
  } catch (err) {
    console.error('[generate-themes] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
