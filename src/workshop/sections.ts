// Section definitions for the workshop brief generator
// Each section defines its search queries, model, and generation instructions

import type { SectionDef } from './types.js';
import {
  TEMPLATE_WORKSHOP_DETAILS,
  TEMPLATE_CORE_PROMISE,
  TEMPLATE_KEY_MESSAGES,
  TEMPLATE_WHAT_GREG_DEMOS,
  TEMPLATE_WEBSITE_PAGE_BRIEF,
  TEMPLATE_VIDEO_SCRIPT,
  TEMPLATE_PAID_ADS,
  TEMPLATE_EMAIL_CAMPAIGN,
  TEMPLATE_SOCIAL_MEDIA_PLAN,
  TEMPLATE_REEL_SCRIPTS,
  TEMPLATE_ASSETS_NEEDED,
  TEMPLATE_DECISIONS_NEEDED,
  TEMPLATE_BUILD_ORDER,
} from './templates.js';

export const BRIEF_SECTIONS: SectionDef[] = [
  {
    id: 'workshop_details',
    name: 'Workshop Details',
    templateText: TEMPLATE_WORKSHOP_DETAILS,
    searchQueries: [],
    maxTokens: 1200,
    model: 'claude-sonnet-4-20250514',
    dependsOn: [],
    sectionPrompt: `Generate the Workshop Details section. Use the workshop config provided (title, price, date, time, format, etc.) to fill in all fields. Write a detailed avatar description specific to this workshop's theme - describe "John" in terms of the specific problems this workshop solves for him. Include "Who this is NOT for" with 3 crisp exclusions.`,
  },
  {
    id: 'core_promise',
    name: 'The Core Promise',
    templateText: TEMPLATE_CORE_PROMISE,
    searchQueries: [
      {
        query: '', // filled dynamically with theme
        matchCount: 5,
      },
    ],
    maxTokens: 800,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['workshop_details'],
    sectionPrompt: `Generate the Core Promise section. This should be 2-3 short, punchy paragraphs. The first paragraph states the headline outcome in concrete terms (revenue figures, time saved, specific results). The second makes it feel accessible ("If you can X, you can do this"). This text will be quoted across ads, emails, and social - make it quotable.`,
  },
  {
    id: 'key_messages',
    name: 'Key Messages',
    templateText: TEMPLATE_KEY_MESSAGES,
    searchQueries: [
      {
        query: '', // filled with theme + "pain points construction business"
        matchCount: 8,
      },
    ],
    maxTokens: 1500,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['core_promise'],
    sectionPrompt: `Generate 5 Key Messages in priority order. Each message has a **bold quoted headline** followed by a 2-3 sentence explanation. Priority order: 1) The headline promise/dream outcome, 2) The multiplier/team angle, 3) A critical distinction (what this ISN'T), 4) An accessibility/simplicity angle, 5) A fear/urgency angle about competitors or falling behind. These messages will be rotated across all marketing channels.`,
  },
  {
    id: 'brand_guidelines',
    name: 'Brand Guidelines',
    templateText: '',
    searchQueries: [],
    maxTokens: 0,
    model: 'claude-sonnet-4-20250514',
    dependsOn: [],
    isStatic: true,
    sectionPrompt: '',
  },
  {
    id: 'what_greg_demos',
    name: 'What Greg Covers in the Workshop',
    templateText: TEMPLATE_WHAT_GREG_DEMOS,
    searchQueries: [
      {
        query: '', // filled with theme
        frameworkFilter: undefined, // set dynamically from workshopConfig.frameworkAreas[0]
        matchCount: 10,
      },
      {
        query: '', // filled with theme + second framework area
        frameworkFilter: undefined,
        matchCount: 5,
      },
    ],
    maxTokens: 2500,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['key_messages'],
    sectionPrompt: `Generate the "What Greg Covers" section. Create a table with 8-10 rows, each with: Teaching Point | Outcome to tease (use in content) | Business impact. These are the workshop's content highlights. Social content should TEASE the outcomes but NEVER reveal the method. Include CRITICAL RULE at the end reminding Chloe to reference outcomes, not methods. Draw teaching points from the Brain Rag content provided.`,
  },
  {
    id: 'website_page_brief',
    name: 'Website Page Brief',
    templateText: TEMPLATE_WEBSITE_PAGE_BRIEF,
    searchQueries: [
      {
        query: '', // theme + "landing page conversion"
        matchCount: 8,
      },
      {
        query: '', // theme + framework
        matchCount: 5,
      },
    ],
    maxTokens: 5000,
    model: 'claude-opus-4-20250514',
    dependsOn: ['key_messages', 'what_greg_demos'],
    sectionPrompt: `Generate the Website Page Brief with 11 numbered subsections. This is a CONVERSION page, not an information page. Every section drives toward the CTA. Include:
1. Hero section (headline, subhead, supporting line, CTA, image direction)
2. The Problem (3 pain points framed around the TEAM)
3. What You'll Walk Away With (value stack with GBP+AUD values)
4. Framework graphic concept relevant to the theme
5. Key distinction section (differentiate from what they've tried)
6. Who Is This For / NOT For
7. Social Proof placeholder
8. Urgency / Why Now
9. Workshop Details summary
10. Greg's credibility (one paragraph max)
11. CTA with punchy one-liner

Write FULL copy for sections 1-3 and 5-6. These should be ready to hand to a web designer.`,
  },
  {
    id: 'video_script',
    name: 'Landing Page Video Script',
    templateText: TEMPLATE_VIDEO_SCRIPT,
    searchQueries: [],
    maxTokens: 1500,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['core_promise', 'key_messages'],
    sectionPrompt: `Generate a 1.5-2 minute landing page video script with timed sections:
- Open (10 secs): Hook that names the problem every builder is thinking about
- Problem (20 secs): Paint the scaling dilemma specific to this theme
- Agitate (15 secs): Competitor threat / cost of inaction
- Solution (20 secs): What the workshop covers, framed as accessible
- Proof (15 secs): 3-4 specific outcomes (tease only, no method reveals)
- CTA (10 secs): Price, team inclusion, register now

Write the FULL spoken script for each section. Greg delivers this to camera.`,
  },
  {
    id: 'paid_ads',
    name: 'Paid Ads Brief',
    templateText: TEMPLATE_PAID_ADS,
    searchQueries: [
      {
        query: '', // theme + "advertising angles"
        matchCount: 8,
      },
      {
        query: '', // theme + "pain points"
        matchCount: 5,
      },
    ],
    maxTokens: 5000,
    model: 'claude-opus-4-20250514',
    dependsOn: ['key_messages', 'what_greg_demos'],
    sectionPrompt: `Generate the Paid Ads Brief with:
1. Core Principle (one sentence about leading with outcomes)
2. 6 Ad Angles - each MUST have a different emotional entry point:
   - Each angle has: Name, Hook (scroll-stopping first line), Body (2-4 sentences), Visual direction, CTA
   - Angles should cover: team multiplier, specific saving/ROI, compliance/cost, scaling dream, competitor fear, lifestyle/aspiration
   - Hooks must be specific with numbers where possible
   - NEVER reveal methods, only outcomes
3. Ad Targeting Notes (construction business owners, £1M+, UK primary, retargeting, lookalikes)
4. Ad Platforms (Facebook/Instagram primary, LinkedIn secondary)

Each angle must be distinct enough to test against each other in a split test.`,
  },
  {
    id: 'email_campaign',
    name: 'Email Campaign (9 Emails)',
    templateText: TEMPLATE_EMAIL_CAMPAIGN,
    searchQueries: [
      {
        query: '', // theme + framework area 1
        matchCount: 8,
      },
      {
        query: '', // theme + framework area 2
        matchCount: 5,
      },
      {
        query: '', // theme + "pain points construction business owners"
        matchCount: 5,
      },
    ],
    maxTokens: 10000,
    model: 'claude-opus-4-20250514',
    dependsOn: ['workshop_details', 'core_promise', 'key_messages', 'what_greg_demos'],
    sectionPrompt: `Generate 9 FULL emails for Go High Level. This is a SALES sequence only - its only job is to sell tickets. No logistics.

PRE-WORKSHOP (6 emails):
- Email 1 - Announcement (2 weeks out): Hook with unexpected angle, introduce workshop, stack value. 200-400 words.
- Email 2 - Problem Deep Dive (11 days out): Paint the problem vividly with specific construction examples. 200-400 words.
- Email 3 - Teaching Teaser (8 days out): Give ONE specific tangible example, then list 5-6 more. 200-400 words.
- Email 4 - Objection Buster (6 days out): Tackle the #1 objection for this topic head-on. 200-400 words.
- Email 5 - Urgency (2 days out): Stack outcomes, do ROI maths, create urgency. 200-400 words.
- Email 6 - Last Chance (day before): Short, punchy, "stop thinking and book." 100-200 words.

POST-WORKSHOP (3 emails):
- Email 7 - Replay + Mastermind (same day, ATTENDEES ONLY): Thank, replay link, bridge to Mastermind. 200-300 words.
- Email 8 - No-Show Offer (same day, NO-SHOWS ONLY): What they missed, replay purchase. 200-300 words.
- Email 9 - Final Push (48 hours after, BOTH): Monday morning landing, split attendee/no-show message. 200-300 words.

Each email needs: send timing, subject line, full body copy, [CTA] markers, P.S. where relevant. Prices in GBP (AUD). Times in BST (AEST). Greg's voice throughout.`,
  },
  {
    id: 'social_media_plan',
    name: 'Social Media Plan',
    templateText: TEMPLATE_SOCIAL_MEDIA_PLAN,
    searchQueries: [
      {
        query: '', // theme + "social media construction"
        matchCount: 5,
      },
    ],
    maxTokens: 4000,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['key_messages', 'what_greg_demos'],
    sectionPrompt: `Generate the Social Media Plan with:
1. CRITICAL RULE about no demos/reveals in social content
2. 7 Key Messages to rotate (with numbers/specifics where possible)
3. Campaign Timeline in 3 phases:
   - Phase 1: Teaser (3 weeks out, 2 posts/week) - awareness, don't sell yet. 2 talking heads + 2 carousels.
   - Phase 2: Launch (2 weeks out, 3 posts/week) - announce, drive registrations. Include announcement post + talking heads + carousels.
   - Phase 3: Countdown (1 week out, daily posts) - urgency. Daily countdown + short talking heads + final push.
4. Content Formats (talking heads, carousels, stories)
5. Platforms (Instagram, Facebook, LinkedIn with format notes)
6. Hashtags (10 relevant ones)
7. CTA (consistent across all posts with workshop details)

Write SPECIFIC post ideas for each phase - not generic suggestions. Include durations and formats in parentheses.`,
  },
  {
    id: 'reel_scripts',
    name: 'Reel Scripts',
    templateText: TEMPLATE_REEL_SCRIPTS,
    searchQueries: [
      {
        query: '', // theme + "pain points"
        matchCount: 5,
      },
    ],
    maxTokens: 4000,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['key_messages'],
    sectionPrompt: `Generate 7 Reel Scripts for Greg to film. CRITICAL: pain-and-tease only. No demos. No reveals.

Each reel:
- 30-50 seconds (80-130 words)
- Scroll-stopping HOOK in first 2 seconds (bold)
- Full spoken script
- CTA with price and "link in bio"

The 7 reels should cover different angles:
1. Competitor threat
2. Money/cost saving (specific figure)
3. Team multiplier
4. Scaling dream
5. Physical prop (on site, holding something relevant)
6. Lifestyle/freedom test
7. Simple provocative question (shortest reel)

Each hook must be different enough to stop a different type of scroller. Write the FULL script for each reel.`,
  },
  {
    id: 'assets_needed',
    name: 'Assets Needed',
    templateText: TEMPLATE_ASSETS_NEEDED,
    searchQueries: [],
    maxTokens: 800,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['reel_scripts', 'website_page_brief', 'email_campaign'],
    sectionPrompt: `Generate the Assets Needed section. List 6-8 numbered items Greg needs to provide or Chloe needs to create, based on the brief sections already generated. Include: talking head clips, registration URL, testimonials, hero image, framework graphic, Go High Level setup, post-purchase automation. End with "NOT needed" list. This should be a practical checklist.`,
  },
  {
    id: 'decisions_needed',
    name: 'Decisions Needed',
    templateText: TEMPLATE_DECISIONS_NEEDED,
    searchQueries: [],
    maxTokens: 500,
    model: 'claude-sonnet-4-20250514',
    dependsOn: ['workshop_details', 'website_page_brief', 'email_campaign'],
    sectionPrompt: `Generate the Decisions Needed section. List any items that genuinely require input from Greg or Chloe before the marketing can go live. Typical items: registration URL format, exact date confirmation, pricing confirmation, testimonial selection, any theme-specific decisions. Keep it short - only list genuine blockers, not nice-to-haves.`,
  },
];

// Also export the build order section (always last, always static pattern)
export const BUILD_ORDER_SECTION_DEF: SectionDef = {
  id: 'build_order',
  name: 'Asset Build Order',
  templateText: TEMPLATE_BUILD_ORDER,
  searchQueries: [],
  maxTokens: 600,
  model: 'claude-sonnet-4-20250514',
  dependsOn: ['assets_needed'],
  sectionPrompt: `Generate the Asset Build Order. Split into Phase 1 (Marketing Assets) and Phase 2 (Slide Deck). Phase 1 lists 6-7 numbered items matching the sections in this brief, with status notes. Phase 2 references a separate slide deck document. Keep it short and actionable.`,
};
