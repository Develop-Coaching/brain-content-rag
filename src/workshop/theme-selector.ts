// Theme selection for monthly workshop generator
// Scans existing workshops, queries Brain Rag, uses Claude to pick a theme

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

import { getContentVariety, type SearchResult } from '../agent/search.js';
import { getSeasonalContext, formatMonth } from '../agent/voice.js';
import type { WorkshopConfig } from './types.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to existing workshops
const WORKSHOPS_DIR = path.resolve(
  __dirname,
  '../../../../Workshops'
);

export function scanExistingWorkshops(): string[] {
  const themes: string[] = [];
  try {
    if (!fs.existsSync(WORKSHOPS_DIR)) {
      console.log(`  Workshops directory not found at ${WORKSHOPS_DIR}, assuming no existing workshops.`);
      return themes;
    }
    const entries = fs.readdirSync(WORKSHOPS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        themes.push(entry.name);
      }
    }
  } catch (err) {
    console.log(`  Could not scan workshops directory: ${err}`);
  }
  return themes;
}

function extractThemeKeywords(folderNames: string[]): string[] {
  const keywords: string[] = [];
  for (const name of folderNames) {
    // Extract meaningful words, skip common words
    const words = name
      .replace(/[-_]/g, ' ')
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !['the', 'and', 'for', 'workshop', 'month'].includes(w.toLowerCase())
      );
    keywords.push(...words.map((w) => w.toLowerCase()));
  }
  return [...new Set(keywords)];
}

export async function selectTheme(
  month: Date,
  themeOverride?: string
): Promise<WorkshopConfig> {
  const monthName = formatMonth(month);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

  // 1. Scan existing workshops
  console.log('[2/8] Querying knowledge base for theme candidates...');
  const existingWorkshops = scanExistingWorkshops();
  const excludedKeywords = extractThemeKeywords(existingWorkshops);
  console.log(
    `  Found ${existingWorkshops.length} existing workshops: ${existingWorkshops.join(', ') || 'none'}`
  );

  // 2. Get content variety from Brain Rag
  const contentVariety = await getContentVariety(5);
  const allChunks: SearchResult[] = [];
  for (const [framework, chunks] of Object.entries(contentVariety)) {
    allChunks.push(...chunks);
  }
  console.log(`  Retrieved ${allChunks.length} chunks across 5 frameworks`);

  // 3. Get seasonal context
  const seasonalContext = getSeasonalContext(month);

  // 4. Build content summary for theme selection
  const contentSummary = Object.entries(contentVariety)
    .map(([framework, chunks]) => {
      const summaries = chunks
        .slice(0, 3)
        .map((c) => `  - ${c.content.slice(0, 150)}...`)
        .join('\n');
      return `**${framework.toUpperCase()}:**\n${summaries}`;
    })
    .join('\n\n');

  // 5. Call Claude to pick a theme
  console.log('\n[3/8] Selecting theme...');

  if (themeOverride) {
    console.log(`  Using override theme: "${themeOverride}"`);
  }

  const themePrompt = themeOverride
    ? `The user has specified this workshop theme: "${themeOverride}". Generate a complete WorkshopConfig for this theme. Still use the knowledge base and seasonal context to inform the details.`
    : `Pick the best workshop theme for ${monthName}. The theme must be:
- Different from all previous workshops (see exclusion list)
- Relevant to the seasonal context
- Well-supported by content in the knowledge base (strong Brain Rag matches)
- Specific enough to fill a 90-minute workshop with actionable content
- Broadly appealing to the target audience (construction business owners at GBP 1M-5M)

If the obvious themes are taken, go deeper into a sub-topic rather than repeating a broad category.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: `You are selecting a workshop theme for Develop Coaching. Greg coaches construction business owners scaling from GBP 1M to GBP 5M. The workshop must be practical, specific, and address a real pain point for builders with teams of 5-10 people.`,
    messages: [
      {
        role: 'user',
        content: `${themePrompt}

MONTH: ${monthName}
SEASONAL CONTEXT: ${seasonalContext}

EXISTING WORKSHOPS (do NOT repeat these themes):
${existingWorkshops.map((w) => `- ${w}`).join('\n') || '- None yet'}

EXCLUDED KEYWORDS: ${excludedKeywords.join(', ') || 'none'}

KNOWLEDGE BASE CONTENT AVAILABLE:
${contentSummary}

Respond in JSON only:
{
  "title": "Workshop Title - Subtitle",
  "subtitle": "The subtitle alone",
  "themeSlug": "kebab-case-slug",
  "frameworkAreas": ["primary_framework", "secondary_framework"],
  "justification": "One paragraph explaining why this theme, why now, and what makes it different from previous workshops",
  "seasonalHook": "One sentence connecting the theme to the seasonal context",
  "dateSuggestion": "A specific date suggestion for this month (e.g. Thursday 15th May 2026)",
  "timeBst": "9am BST",
  "timeAest": "6pm AEST",
  "priceGbp": 45,
  "priceAud": 85,
  "format": "90-minute paid workshop (Zoom)",
  "durationMinutes": 90,
  "targetAudience": "Construction business owners with teams of 5-10",
  "avatar": "A 3-4 sentence avatar description specific to this theme's problems",
  "notFor": "2-3 crisp exclusions",
  "conversionGoal": "Mastermind applications"
}`,
      },
    ],
  });

  const responseText =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse theme selection response as JSON');
  }

  const themeData = JSON.parse(jsonMatch[0]);

  const config: WorkshopConfig = {
    title: themeData.title,
    subtitle: themeData.subtitle,
    themeSlug: themeData.themeSlug,
    frameworkAreas: themeData.frameworkAreas,
    justification: themeData.justification,
    seasonalHook: themeData.seasonalHook,
    dateSuggestion: themeData.dateSuggestion,
    timeBst: themeData.timeBst || '9am BST',
    timeAest: themeData.timeAest || '6pm AEST',
    priceGbp: themeData.priceGbp || 45,
    priceAud: themeData.priceAud || 85,
    format: themeData.format || '90-minute paid workshop (Zoom)',
    durationMinutes: themeData.durationMinutes || 90,
    targetAudience:
      themeData.targetAudience ||
      'Construction business owners at GBP 1M-5M with teams of 5-10',
    avatar: themeData.avatar,
    notFor: themeData.notFor,
    conversionGoal: themeData.conversionGoal || 'Mastermind applications',
    monthKey,
    monthName,
  };

  console.log(`  Selected: "${config.title}"`);
  console.log(`  Framework: ${config.frameworkAreas.join(', ')}`);
  console.log(`  Justification: ${config.justification.slice(0, 120)}...`);

  return config;
}
