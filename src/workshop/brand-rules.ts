// Brand rules and validation for Develop Coaching workshop content
// Enforces UK spelling, tone, terminology, and persona constraints

import type { BrandValidationResult } from './types.js';

export const BRAND_COLOURS = {
  yellow: '#fdce36',
  orange: '#fbaa35',
  blue: '#0069b1',
  darkGrey: '#414042',
  coolGrey: '#d2d2d2',
} as const;

export const BRAND_FONT = 'Arial';

// US -> UK spelling replacements
const US_TO_UK_SPELLING: [RegExp, string][] = [
  [/\borganize\b/gi, 'organise'],
  [/\borganized\b/gi, 'organised'],
  [/\borganizing\b/gi, 'organising'],
  [/\borganization\b/gi, 'organisation'],
  [/\boptimize\b/gi, 'optimise'],
  [/\boptimized\b/gi, 'optimised'],
  [/\boptimizing\b/gi, 'optimising'],
  [/\boptimization\b/gi, 'optimisation'],
  [/\bcolor\b/gi, 'colour'],
  [/\bcolors\b/gi, 'colours'],
  [/\bbehavior\b/gi, 'behaviour'],
  [/\bbehaviors\b/gi, 'behaviours'],
  [/\bcenter\b/gi, 'centre'],
  [/\bcenters\b/gi, 'centres'],
  [/\banalyze\b/gi, 'analyse'],
  [/\banalyzed\b/gi, 'analysed'],
  [/\banalyzing\b/gi, 'analysing'],
  [/\brecognize\b/gi, 'recognise'],
  [/\brecognized\b/gi, 'recognised'],
  [/\brecognizing\b/gi, 'recognising'],
  [/\bspecialize\b/gi, 'specialise'],
  [/\bspecialized\b/gi, 'specialised'],
  [/\bspecializing\b/gi, 'specialising'],
  [/\bmaximize\b/gi, 'maximise'],
  [/\bmaximized\b/gi, 'maximised'],
  [/\bmaximizing\b/gi, 'maximising'],
  [/\bminimize\b/gi, 'minimise'],
  [/\bminimized\b/gi, 'minimised'],
  [/\bminimizing\b/gi, 'minimising'],
  [/\bcustomize\b/gi, 'customise'],
  [/\bcustomized\b/gi, 'customised'],
  [/\bcustomizing\b/gi, 'customising'],
  [/\butilize\b/gi, 'utilise'],
  [/\butilized\b/gi, 'utilised'],
  [/\butilizing\b/gi, 'utilising'],
  [/\bfavor\b/gi, 'favour'],
  [/\bfavorite\b/gi, 'favourite'],
  [/\bhonor\b/gi, 'honour'],
  [/\blabor\b/gi, 'labour'],
  [/\bneighbor\b/gi, 'neighbour'],
  [/\bneighborhood\b/gi, 'neighbourhood'],
  [/\bfulfill\b/gi, 'fulfil'],
  [/\bfulfilled\b/gi, 'fulfilled'],
  [/\bfulfilling\b/gi, 'fulfilling'],
  [/\bdefense\b/gi, 'defence'],
  [/\boffense\b/gi, 'offence'],
  [/\blicense\b/gi, 'licence'],
  [/\bpractice\b(?=\s|[.,;:!?])/gi, 'practise'], // verb form only (before whitespace/punctuation)
  [/\bprogramme?\b/gi, 'programme'],
];

// Banned words -> replacements
const BANNED_WORDS: [RegExp, string][] = [
  [/\bworkflows?\b/gi, 'tasks'],
  [/\bdeliverables?\b/gi, 'documents'],
  [/\bimplement(?:s|ed|ing|ation)?\b/gi, 'set up'],
  [/\bcompetitive advantage\b/gi, 'get ahead'],
  [/\bworkforce\b/gi, 'team'],
  [/\brevolutionis[ez]\w*/gi, ''],
  [/\btransformative\b/gi, ''],
  [/\bcutting[\s-]edge\b/gi, ''],
  [/\bleverage\b/gi, 'use'],
  [/\bleveraging\b/gi, 'using'],
  [/\bgenuinely\b/gi, ''],
  [/\bstraightforward\b/gi, ''],
  [/\bit's important to note\b/gi, ''],
];

// Em-dash patterns
const EM_DASH_PATTERN = /[\u2014\u2013]/g;

// Patterns that suggest Greg is doing builder tasks (not coaching)
const GREG_AS_BUILDER_PATTERNS = [
  /\bGreg\b[^.]*?\b(?:writes?|writing|wrote)\b[^.]*?\b(?:scopes?|estimates?|RAMS|tenders?|quotes?)\b/gi,
  /\bGreg\b[^.]*?\b(?:builds?|building|built)\b[^.]*?\b(?:houses?|extensions?|lofts?|projects?)\b/gi,
  /\bGreg\b[^.]*?\b(?:runs? a|his)\b[^.]*?\b(?:construction|building)\s+(?:company|business|firm)\b/gi,
  /\bGreg\b[^.]*?\bon site\b/gi,
];

// Sales call patterns that should be "scale session"
const SALES_CALL_PATTERNS = [
  /\bsales call\b/gi,
  /\btriage call\b/gi,
  /\bbook a call with Greg\b/gi,
  /\bcall with Greg\b/gi,
  /\bGreg\b[^.]*?\bconducts?\b[^.]*?\bcalls?\b/gi,
];

export function validateBrandRules(text: string): BrandValidationResult {
  const autoFixes: string[] = [];
  const warnings: string[] = [];
  let result = text;

  // 1. Fix US -> UK spelling
  for (const [pattern, replacement] of US_TO_UK_SPELLING) {
    const matches = result.match(pattern);
    if (matches) {
      for (const match of matches) {
        autoFixes.push(`UK spelling: "${match}" -> "${replacement}"`);
      }
      result = result.replace(pattern, replacement);
    }
  }

  // 2. Fix em-dashes
  const emDashMatches = result.match(EM_DASH_PATTERN);
  if (emDashMatches) {
    autoFixes.push(`Replaced ${emDashMatches.length} em-dash(es) with hyphens`);
    result = result.replace(EM_DASH_PATTERN, ' - ');
  }

  // 3. Fix banned words
  for (const [pattern, replacement] of BANNED_WORDS) {
    const matches = result.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (replacement) {
          autoFixes.push(`Banned word: "${match}" -> "${replacement}"`);
        } else {
          autoFixes.push(`Removed banned word: "${match}"`);
        }
      }
      result = result.replace(pattern, replacement);
    }
  }

  // Clean up double spaces from removals
  result = result.replace(/ {2,}/g, ' ');

  // 4. Warn on Greg-as-builder
  for (const pattern of GREG_AS_BUILDER_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      for (const match of matches) {
        warnings.push(
          `Greg-as-builder: "${match.trim()}" - Greg runs a COACHING business. Reference his CLIENTS instead.`
        );
      }
    }
  }

  // 5. Warn on sales call language
  for (const pattern of SALES_CALL_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      for (const match of matches) {
        warnings.push(
          `Sales language: "${match.trim()}" - Should be "scale session". The sales team owns the pipeline, not Greg.`
        );
      }
    }
  }

  return { text: result, autoFixes, warnings };
}

// Brand guidelines section content (static, not generated)
export const BRAND_GUIDELINES_SECTION = `## Brand Guidelines

- **Brand colours:** Yellow ${BRAND_COLOURS.yellow}, Orange ${BRAND_COLOURS.orange}, Blue ${BRAND_COLOURS.blue}, Dark Grey ${BRAND_COLOURS.darkGrey}, Cool Grey ${BRAND_COLOURS.coolGrey}
- **Font:** ${BRAND_FONT} throughout
- **UK spelling throughout**
- **Never use em-dashes.** Use hyphens, commas, or full stops instead.
- **Tone:** Direct, down-to-earth, construction language. Not corporate. Not tech-bro. Greg speaks like a coach who knows the industry, not a Silicon Valley founder.
- **Language:** "Tasks" not "workflows." "Documents" not "deliverables." "Set it up" not "implement." "Get ahead" not "gain competitive advantage." "Your team" not "your workforce."
- **Frame pain points around the team, not the owner personally.** Not "you're writing RAMS at 9pm." Instead: "your team spends hours on RAMS that should take 2 minutes." The \u00a31M+ builder has people doing this work. The problem is those people are doing it slowly.
- **Critical rule:** Greg does not run a construction business. He runs a coaching business. Any scripts referencing him doing builder tasks (writing scopes, estimating) should reference his CLIENTS instead.
- **Critical rule:** Greg does not conduct calls. The sales team owns the full pipeline from outreach through to Mastermind close. The triage call is called a "scale session" internally.
- **Avoid:** Jargon, hype, "revolutionise", "transform", "cutting-edge", "leverage", any language that sounds like a tech company wrote it. Also avoid speaking to the one-man-band. This is for builders with teams.`;

// System prompt prefix for all workshop generation calls
export const WORKSHOP_BRAND_SYSTEM = `You are generating a marketing brief for a Develop Coaching workshop. Greg is the founder of Develop Coaching - a coaching business for construction business owners.

BRAND RULES (MUST follow):
- UK spelling throughout. Never US spelling.
- Never use em-dashes. Use hyphens, commas, or full stops.
- Font: Arial. Colours: Yellow #fdce36, Orange #fbaa35, Blue #0069b1, Dark Grey #414042, Cool Grey #d2d2d2.
- Tone: Direct, down-to-earth, construction language. Not corporate. Not tech-bro.
- Use "tasks" not "workflows", "documents" not "deliverables", "set it up" not "implement", "get ahead" not "competitive advantage", "team" not "workforce".
- Frame pain points around the TEAM, not the owner personally. The builder at this level has people doing the work - the problem is those people are doing it slowly.
- Greg runs a COACHING business. Never write Greg doing builder tasks (writing scopes, estimating, on site). Reference his CLIENTS or "builders he works with".
- Greg does NOT conduct sales calls. The sales team owns the pipeline. "Scale session" not "triage call".
- Target audience: construction business owners at GBP 1M-5M revenue with teams of 5-10. NOT solo traders or one-man-bands.
- All prices show GBP with AUD in brackets. All times show BST with AEST.
- Never use: "revolutionise", "transform", "cutting-edge", "leverage", "genuinely", "straightforward", "it's important to note".

This brief will be used by Chloe to build all marketing assets. Every section must be complete and actionable - no placeholders, no "[insert here]", no TBD items except where genuinely requiring Greg's input.`;
