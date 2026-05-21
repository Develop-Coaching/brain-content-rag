// Lead magnet generator
// Determines format rotation, generates content tied to workshop theme

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

import { hybridSearch } from '../agent/search.js';
import { GREG_SYSTEM_PROMPT } from '../agent/voice.js';
import { validateBrandRules, WORKSHOP_BRAND_SYSTEM } from './brand-rules.js';
import type {
  WorkshopConfig,
  LeadMagnetFormat,
  LeadMagnetConfig,
  LeadMagnetOutput,
} from './types.js';
import { LEAD_MAGNET_ROTATION as ROTATION } from './types.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSHOPS_DIR = path.resolve(__dirname, '../../../../Workshops');

export function determineLeadMagnetFormat(
  formatOverride?: LeadMagnetFormat
): LeadMagnetFormat {
  if (formatOverride) return formatOverride;

  // Count existing lead magnets to determine rotation position
  let existingCount = 0;
  try {
    if (fs.existsSync(WORKSHOPS_DIR)) {
      const workshops = fs.readdirSync(WORKSHOPS_DIR, { withFileTypes: true });
      for (const ws of workshops) {
        if (ws.isDirectory()) {
          const leadMagnetDir = path.join(WORKSHOPS_DIR, ws.name, 'Lead_Magnet');
          if (fs.existsSync(leadMagnetDir)) {
            const metadataPath = path.join(leadMagnetDir, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
              existingCount++;
            }
          }
        }
      }
    }
  } catch {
    // If we can't read, start at 0
  }

  return ROTATION[existingCount % ROTATION.length];
}

function getFormatInstructions(format: LeadMagnetFormat): {
  prompt: string;
  model: string;
  maxTokens: number;
} {
  switch (format) {
    case 'ebook':
      return {
        prompt: `Generate a comprehensive ebook/guide (10-15 pages equivalent in markdown).

Structure:
- Title page concept (title, subtitle, "by Develop Coaching")
- Table of contents
- 8-10 chapters, each 300-500 words
- Each chapter: heading, introduction paragraph, 3-5 key points with explanations, practical action item
- Final chapter: "Your Next Step" bridging to the workshop/Mastermind
- CTA page: workshop details + Mastermind teaser

Draw heavily from the Brain Rag content provided. Every chapter should contain specific, actionable advice that construction business owners can use immediately. Use real numbers, real scenarios, and construction-specific language.`,
        model: 'claude-opus-4-20250514',
        maxTokens: 10000,
      };

    case 'checklist':
      return {
        prompt: `Generate a practical checklist/template pack (3-5 pages equivalent in markdown).

Structure:
- Title and introduction (2-3 paragraphs explaining how to use it)
- 3-4 separate checklists, each themed around a sub-topic
- Each checklist: 10-15 items with checkboxes and brief explanations
- Scoring/assessment section: "Score yourself: 0-5 items = ..., 6-10 = ..., 11-15 = ..."
- Action plan template: "Your Top 3 Priorities This Week"
- CTA: workshop details + Mastermind teaser

Make every item specific to construction businesses. No generic business advice.`,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 5000,
      };

    case 'email-course':
      return {
        prompt: `Generate a 5-day mini email course.

Generate 5 separate emails, one per day:
- Day 1: The problem (why this matters for builders right now)
- Day 2: The framework (introduce the core concept)
- Day 3: Quick win (one thing they can do today)
- Day 4: Common mistakes (what to avoid)
- Day 5: The full system (tie it together + workshop/Mastermind CTA)

Each email: 300-500 words, subject line, Greg's voice, one key takeaway, P.S. line.

Format each email as:
## Day X: [Title]
**Subject:** [subject line]
[body]
**P.S.** [teaser for next day or CTA]`,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 6000,
      };

    case 'calculator':
      return {
        prompt: `Generate a detailed specification for an interactive calculator/assessment tool.

This is a SPECIFICATION document (not working code). Include:
- Calculator title and purpose
- Input fields (5-8 fields with labels, types, default values, validation rules)
- Calculation logic (formulas in plain English + pseudocode)
- Output sections (what results to show, how to format them)
- Scoring tiers (if assessment-style: "If score is X-Y, your business is at [level]")
- Copy for each result tier (2-3 paragraphs of personalised advice)
- Visual layout description
- CTA for each result tier (workshop for lower scores, Mastermind for higher)
- Sample calculations with worked examples

Make all fields and formulas specific to construction businesses (revenue, team size, hours per week, margins, etc.).`,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 5000,
      };

    case 'quiz':
      return {
        prompt: `Generate a detailed specification for a quiz with personalised results.

Structure:
- Quiz title and hook (why take this quiz)
- 10-12 questions, each with 3-4 multiple choice answers
- Each answer has a score value (A=3, B=2, C=1)
- Questions should be practical scenarios, not theoretical
- 3-4 result profiles based on total score ranges
- Each result profile: catchy title, 2-3 paragraph personalised analysis, specific recommendations, CTA
- Social sharing copy for each result
- Email capture gate: "Get your full results + personalised action plan"

Make all questions about real construction business scenarios. Results should feel like getting advice from Greg.`,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 6000,
      };
  }
}

export async function generateLeadMagnet(
  config: WorkshopConfig,
  formatOverride?: LeadMagnetFormat
): Promise<LeadMagnetOutput> {
  const format = determineLeadMagnetFormat(formatOverride);
  const formatLabel = format.replace('-', ' ');

  console.log(`\n[7/8] Generating lead magnet (format: ${formatLabel})...`);

  // Query Brain Rag for theme-relevant content
  const chunks = await hybridSearch(
    `${config.title} ${config.frameworkAreas.join(' ')} construction business`,
    15,
    config.frameworkAreas[0]
  );

  const brainRagContent = chunks
    .slice(0, 12)
    .map(
      (c, i) =>
        `[${i + 1}] (${c.framework_tags?.join(', ') || 'general'}) ${c.content.slice(0, 300)}...`
    )
    .join('\n\n');

  const { prompt: formatPrompt, model, maxTokens } = getFormatInstructions(format);

  // Generate the lead magnet content
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: `${GREG_SYSTEM_PROMPT}\n\n${WORKSHOP_BRAND_SYSTEM}`,
    messages: [
      {
        role: 'user',
        content: `Generate a lead magnet for the "${config.title}" workshop.

FORMAT: ${formatLabel}
THEME: ${config.subtitle}
FRAMEWORK AREAS: ${config.frameworkAreas.join(', ')}

${formatPrompt}

KNOWLEDGE BASE CONTENT TO DRAW FROM:
${brainRagContent}

IMPORTANT:
- UK spelling throughout
- Greg's voice - direct, construction language, not corporate
- Every piece of advice must be specific to construction businesses
- Include workshop details in the CTA: ${config.dateSuggestion}, £${config.priceGbp} ($${config.priceAud} AUD)
- The lead magnet title should follow the pattern: "The Builder's Guide to [Topic]" or "The [Topic] Checklist for Construction Businesses"

Output markdown only. No preamble.`,
      },
    ],
  });

  const contentText =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const validated = validateBrandRules(contentText);

  // Extract title from content (first # heading)
  const titleMatch = validated.text.match(/^#\s+(.+)$/m);
  const title = titleMatch
    ? titleMatch[1]
    : `The Builder's Guide to ${config.subtitle}`;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const leadMagnetConfig: LeadMagnetConfig = {
    format,
    title,
    slug,
    theme: config.subtitle,
    monthKey: config.monthKey,
  };

  console.log(`  Title: "${title}"`);

  // Generate format notes
  const formatNotes = generateFormatNotes(format, title);

  // Generate delivery notes
  const deliveryNotes = generateDeliveryNotes(format, title, config);

  // Generate social hooks
  const socialHooksResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: GREG_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Generate 5 social media hooks for promoting this free lead magnet: "${title}" (${formatLabel}).

These are "comment to get" style hooks for Instagram/Facebook. Each should be a different angle.

Format:
1. [Platform] Hook: "[the hook text]" | Comment trigger: "[keyword]"

Example: Instagram Hook: "I made a free guide showing builders how to stop losing money on materials. Comment GUIDE and I'll send it to you." | Comment trigger: "GUIDE"

Make all 5 different angles but for the same lead magnet. Greg's voice.`,
      },
    ],
  });

  const socialHooks =
    socialHooksResponse.content[0].type === 'text'
      ? socialHooksResponse.content[0].text
      : '';

  // Handle email-course format (split into separate files)
  let emailFiles: Map<string, string> | undefined;
  if (format === 'email-course') {
    emailFiles = new Map();
    const dayMatches = validated.text.split(/(?=## Day \d)/);
    for (const dayContent of dayMatches) {
      const dayMatch = dayContent.match(/## Day (\d)/);
      if (dayMatch) {
        emailFiles.set(`day-${dayMatch[1]}.md`, dayContent.trim());
      }
    }
  }

  return {
    config: leadMagnetConfig,
    content: validated.text,
    formatNotes,
    deliveryNotes,
    socialHooks,
    emailFiles,
  };
}

function generateFormatNotes(format: LeadMagnetFormat, title: string): string {
  const formatGuides: Record<LeadMagnetFormat, string> = {
    ebook: `# Format Notes: Ebook/Guide

**Title:** ${title}
**Format:** PDF ebook, 10-15 pages
**Delivery:** Direct download after email capture

## How to convert to PDF
1. Use the markdown content as the base
2. Apply Develop Coaching brand template (Arial font, brand colours)
3. Add cover page with title, Develop Coaching logo, and brand imagery
4. Add page numbers and footer with developcoaching.co.uk
5. Export as PDF

## Design notes
- Use branded section headers (Blue #0069b1 backgrounds with white text)
- Pull quotes in Yellow #fdce36 highlight boxes
- Action items in Orange #fbaa35 callout boxes
- Keep paragraphs short for mobile reading`,

    checklist: `# Format Notes: Checklist/Template Pack

**Title:** ${title}
**Format:** PDF checklist, 3-5 pages
**Delivery:** Direct download after email capture

## How to convert to PDF
1. Use the markdown content as the base
2. Apply Develop Coaching brand template
3. Use proper checkbox styling (unfilled squares for print, styled checkboxes for digital)
4. Add scoring section at the end
5. Export as PDF (ensure checkboxes are fillable if digital-only)

## Design notes
- Each checklist gets its own page
- Use numbered items with checkbox squares
- Colour-code sections by priority (Yellow = quick wins, Orange = medium, Blue = strategic)`,

    'email-course': `# Format Notes: 5-Day Email Course

**Title:** ${title}
**Format:** 5 automated emails over 5 days
**Delivery:** Email automation (Go High Level)

## Setup in Go High Level
1. Create a new automation workflow
2. Trigger: form submission or "comment KEYWORD" automation
3. Day 1 email sends immediately
4. Days 2-5 send at 8am BST each subsequent day
5. Add workshop CTA to footer of each email
6. Tag contacts as "lead-magnet-${format}" for segmentation`,

    calculator: `# Format Notes: Calculator/Assessment Tool

**Title:** ${title}
**Format:** Interactive web page (HTML/JS)
**Delivery:** Hosted page, email-gated results

## Build notes
This is a SPECIFICATION, not working code. To build:
1. Create a single-page app (can be embedded in GHL or hosted separately)
2. Use the input fields, formulas, and result tiers from the spec
3. Gate full results behind email capture
4. Style with Develop Coaching brand (Arial, brand colours)
5. Mobile-responsive required`,

    quiz: `# Format Notes: Quiz

**Title:** ${title}
**Format:** Interactive quiz with personalised results
**Delivery:** Hosted page or embedded form, email-gated results

## Build notes
This is a SPECIFICATION, not working code. To build:
1. Can use Typeform, ScoreApp, or custom HTML/JS
2. Questions flow one at a time for engagement
3. Email capture before showing results
4. Each result profile has shareable social images
5. Style with Develop Coaching brand`,
  };

  return formatGuides[format];
}

function generateDeliveryNotes(
  format: LeadMagnetFormat,
  title: string,
  config: WorkshopConfig
): string {
  return `# Delivery Notes

**Lead Magnet:** ${title}
**Format:** ${format.replace('-', ' ')}
**Workshop:** ${config.title}
**Month:** ${config.monthName}

## Delivery method options

### Option 1: Go High Level automation (recommended)
1. Create landing page or use "comment trigger" on social
2. Capture email address
3. Auto-deliver lead magnet via email
4. Add to workshop email sequence (start sales emails 2-3 days after lead magnet delivery)
5. Tag contact: "lead-magnet-${config.monthKey}"

### Option 2: Link in bio / landing page
1. Create standalone landing page on developcoaching.co.uk
2. Email gate with Go High Level form
3. Redirect to download/access page after submission
4. Trigger workshop email sequence

## Social promotion
- Use the "comment to get" hooks in social-hooks.md
- Pin first comment with the keyword trigger
- Run as both organic posts and paid ads (low-cost lead gen)
- Retarget leads who downloaded but haven't registered for workshop

## Tracking
- UTM: utm_source=lead_magnet&utm_medium=${format}&utm_campaign=${config.themeSlug}
- Track: downloads -> workshop registrations -> Mastermind applications`;
}
