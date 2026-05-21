// Section-by-section brief generation engine
// Loops through section definitions, queries Brain Rag, calls Claude, validates brand rules

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

import { hybridSearch, type SearchResult } from '../agent/search.js';
import { GREG_SYSTEM_PROMPT } from '../agent/voice.js';
import { validateBrandRules, WORKSHOP_BRAND_SYSTEM, BRAND_GUIDELINES_SECTION } from './brand-rules.js';
import { BRIEF_SECTIONS, BUILD_ORDER_SECTION_DEF } from './sections.js';
import type { WorkshopConfig, SectionDef, GeneratedSection, GenerationProgress } from './types.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RETRY_DELAYS = [2000, 4000, 8000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callClaudeWithRetry(
  model: string,
  maxTokens: number,
  system: string,
  userMessage: string
): Promise<{ text: string; truncated: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';
      const truncated = response.stop_reason === 'max_tokens';

      return { text, truncated };
    } catch (err: any) {
      if (attempt < 2) {
        console.log(
          `    Retry ${attempt + 1}/3 after error: ${err.message?.slice(0, 80)}`
        );
        await sleep(RETRY_DELAYS[attempt]);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Unreachable');
}

function fillSearchQueries(
  section: SectionDef,
  config: WorkshopConfig
): SectionDef {
  const filled = { ...section, searchQueries: [...section.searchQueries] };

  for (let i = 0; i < filled.searchQueries.length; i++) {
    const sq = { ...filled.searchQueries[i] };

    // Fill empty queries with theme-relevant searches
    if (!sq.query) {
      switch (i) {
        case 0:
          sq.query = `${config.title} ${config.frameworkAreas[0] || ''} construction business`;
          break;
        case 1:
          sq.query = `${config.subtitle || config.title} ${config.frameworkAreas[1] || config.frameworkAreas[0] || ''} pain points`;
          break;
        case 2:
          sq.query = `${config.title} pain points construction business owners`;
          break;
        default:
          sq.query = config.title;
      }
    }

    // Fill framework filter from config if not set
    if (!sq.frameworkFilter && config.frameworkAreas[i]) {
      sq.frameworkFilter = config.frameworkAreas[i];
    }

    filled.searchQueries[i] = sq;
  }

  return filled;
}

function buildContextFromPriorSections(
  sectionId: string,
  dependsOn: string[],
  generated: Map<string, GeneratedSection>
): string {
  if (dependsOn.length === 0) return '';

  const parts: string[] = [];

  for (const depId of dependsOn) {
    const dep = generated.get(depId);
    if (!dep) continue;

    // Include first 3 dependency sections verbatim (they're short and critical for consistency)
    const verbatimIds = ['workshop_details', 'core_promise', 'key_messages'];
    if (verbatimIds.includes(depId)) {
      parts.push(`=== ${dep.name} (generated) ===\n${dep.content}`);
    } else {
      // Summarise longer sections to manage context window
      const lines = dep.content.split('\n');
      const summary =
        lines.length > 20
          ? lines.slice(0, 20).join('\n') + '\n[... truncated for context ...]'
          : dep.content;
      parts.push(`=== ${dep.name} (summary) ===\n${summary}`);
    }
  }

  return parts.length > 0
    ? `\n\nPREVIOUSLY GENERATED SECTIONS (use these for consistency in dates, prices, messaging):\n\n${parts.join('\n\n')}`
    : '';
}

function buildWorkshopConfigBlock(config: WorkshopConfig): string {
  return `WORKSHOP CONFIG:
- Title: ${config.title}
- Subtitle: ${config.subtitle}
- Date: ${config.dateSuggestion}
- Time: ${config.timeBst} / ${config.timeAest}
- Price: £${config.priceGbp} ($${config.priceAud} AUD)
- Format: ${config.format}
- Duration: ${config.durationMinutes} minutes
- Target Audience: ${config.targetAudience}
- Avatar: ${config.avatar}
- NOT for: ${config.notFor}
- Conversion Goal: ${config.conversionGoal}
- Framework Areas: ${config.frameworkAreas.join(', ')}
- Seasonal Hook: ${config.seasonalHook}
- Month: ${config.monthName}`;
}

export async function generateAllSections(
  config: WorkshopConfig,
  progress?: GenerationProgress
): Promise<{
  sections: Map<string, GeneratedSection>;
  totalAutoFixes: number;
  totalWarnings: string[];
}> {
  const sections = new Map<string, GeneratedSection>();
  let totalAutoFixes = 0;
  const totalWarnings: string[] = [];

  // Restore from progress if resuming
  if (progress) {
    for (const sectionId of progress.completedSections) {
      const content = progress.generatedContent[sectionId];
      if (content) {
        sections.set(sectionId, {
          id: sectionId,
          name: sectionId,
          content,
          autoFixes: [],
          warnings: [],
          generationTimeMs: 0,
          truncated: false,
        });
      }
    }
    if (sections.size > 0) {
      console.log(`  Resuming from progress: ${sections.size} sections already done`);
    }
  }

  // All sections including build order
  const allSections = [...BRIEF_SECTIONS, BUILD_ORDER_SECTION_DEF];
  const total = allSections.length;

  console.log(`\n[4/8] Generating brief sections (${total} total)...`);

  for (let i = 0; i < allSections.length; i++) {
    const sectionDef = allSections[i];
    const num = `[${i + 1}/${total}]`;
    const label = `${num} ${sectionDef.name}`;

    // Skip if already generated (resume)
    if (sections.has(sectionDef.id)) {
      console.log(`  ${label} ${'·'.repeat(Math.max(1, 40 - label.length))} skipped (resumed)`);
      continue;
    }

    const startTime = Date.now();

    // Handle static sections (brand guidelines)
    if (sectionDef.isStatic) {
      sections.set(sectionDef.id, {
        id: sectionDef.id,
        name: sectionDef.name,
        content: BRAND_GUIDELINES_SECTION,
        autoFixes: [],
        warnings: [],
        generationTimeMs: 0,
        truncated: false,
      });
      console.log(`  ${label} ${'·'.repeat(Math.max(1, 40 - label.length))} done (static)`);
      continue;
    }

    // Check dependencies are met
    const missingDeps = sectionDef.dependsOn.filter((d) => !sections.has(d));
    if (missingDeps.length > 0) {
      console.log(
        `  ${label} ${'·'.repeat(Math.max(1, 40 - label.length))} SKIPPED (missing deps: ${missingDeps.join(', ')})`
      );
      continue;
    }

    // 1. Run Brain Rag searches
    const filledDef = fillSearchQueries(sectionDef, config);
    let brainRagContent = '';

    if (filledDef.searchQueries.length > 0) {
      const chunks: SearchResult[] = [];
      for (const sq of filledDef.searchQueries) {
        try {
          const results = await hybridSearch(
            sq.query,
            sq.matchCount,
            sq.frameworkFilter,
            sq.topicFilter
          );
          chunks.push(...results);
        } catch (err: any) {
          console.log(`    Search warning: ${err.message?.slice(0, 60)}`);
        }
      }

      if (chunks.length > 0) {
        // Deduplicate by ID
        const seen = new Set<string>();
        const unique = chunks.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        brainRagContent = `\n\nKNOWLEDGE BASE CONTENT (draw on this for specific frameworks, terminology, and teaching points - weave naturally, don't quote verbatim):\n\n${unique
          .slice(0, 10)
          .map(
            (c, idx) =>
              `[${idx + 1}] (${c.framework_tags?.join(', ') || 'general'}) ${c.content.slice(0, 300)}...`
          )
          .join('\n\n')}`;
      }
    }

    // 2. Build the prompt
    const priorContext = buildContextFromPriorSections(
      sectionDef.id,
      sectionDef.dependsOn,
      sections
    );

    const configBlock = buildWorkshopConfigBlock(config);

    const systemPrompt = `${GREG_SYSTEM_PROMPT}\n\n${WORKSHOP_BRAND_SYSTEM}`;

    const userMessage = `Generate the "${sectionDef.name}" section for the ${config.title} workshop marketing brief.

${configBlock}

SECTION-SPECIFIC INSTRUCTIONS:
${sectionDef.sectionPrompt}

STRUCTURAL REFERENCE (match this structure, but write NEW content for the ${config.title} workshop):
${sectionDef.templateText}${brainRagContent}${priorContext}

CONSISTENCY RULES:
- The workshop title is "${config.title}". Use it EXACTLY.
- The price is £${config.priceGbp} ($${config.priceAud} AUD). Use this format EXACTLY.
- The date is ${config.dateSuggestion}. The time is ${config.timeBst} / ${config.timeAest}.
- Use UK spelling throughout. Never use em-dashes.
- Frame pain points around the TEAM, not the owner personally.
- Output markdown only. No preamble, no "here is the section", just the section content starting with the ## heading.`;

    // 3. Call Claude
    try {
      const { text, truncated } = await callClaudeWithRetry(
        sectionDef.model,
        sectionDef.maxTokens,
        systemPrompt,
        userMessage
      );

      // 4. Brand validation
      const validation = validateBrandRules(text);
      totalAutoFixes += validation.autoFixes.length;
      totalWarnings.push(...validation.warnings);

      let content = validation.text;
      if (truncated) {
        content += '\n\n[TRUNCATED - May need manual completion]';
      }

      const elapsed = Date.now() - startTime;

      sections.set(sectionDef.id, {
        id: sectionDef.id,
        name: sectionDef.name,
        content,
        autoFixes: validation.autoFixes,
        warnings: validation.warnings,
        generationTimeMs: elapsed,
        truncated,
      });

      const statusBits: string[] = [`done (${(elapsed / 1000).toFixed(1)}s)`];
      if (truncated) statusBits.push('TRUNCATED');
      if (validation.warnings.length > 0)
        statusBits.push(`${validation.warnings.length} warning(s)`);

      console.log(
        `  ${label} ${'·'.repeat(Math.max(1, 40 - label.length))} ${statusBits.join(', ')}`
      );
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.error(
        `  ${label} ${'·'.repeat(Math.max(1, 40 - label.length))} FAILED (${(elapsed / 1000).toFixed(1)}s): ${err.message?.slice(0, 80)}`
      );

      sections.set(sectionDef.id, {
        id: sectionDef.id,
        name: sectionDef.name,
        content: `## ${sectionDef.name}\n\n[GENERATION FAILED - MANUAL REQUIRED]\n\nError: ${err.message?.slice(0, 200)}`,
        autoFixes: [],
        warnings: [`Section "${sectionDef.name}" failed to generate`],
        generationTimeMs: elapsed,
        truncated: false,
      });
      totalWarnings.push(`Section "${sectionDef.name}" failed to generate: ${err.message?.slice(0, 100)}`);
    }

    // Brief pause between API calls to avoid bursts
    await sleep(1000);
  }

  return { sections, totalAutoFixes, totalWarnings };
}

export function assembleBrief(
  config: WorkshopConfig,
  sections: Map<string, GeneratedSection>
): string {
  const allSectionDefs = [...BRIEF_SECTIONS, BUILD_ORDER_SECTION_DEF];
  const parts: string[] = [];

  // Title
  parts.push(`# ${config.title} - Marketing Brief`);
  parts.push('');
  parts.push(
    `> **Generated:** ${new Date().toISOString().split('T')[0]} | **Month:** ${config.monthName} | **Theme:** ${config.subtitle}`
  );
  parts.push('');

  // Purpose
  parts.push('## Purpose of This Document');
  parts.push('');
  parts.push(
    `This is the marketing brief for the "${config.title}" workshop. It contains everything needed to build the marketing assets: website page, emails, paid ads, social media plan, and reel scripts. This is Chloe's primary reference document.`
  );
  parts.push('');
  parts.push('---');
  parts.push('');

  // Each section
  for (const def of allSectionDefs) {
    const section = sections.get(def.id);
    if (!section) continue;

    parts.push(section.content);
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

export function validateCompleteness(
  sections: Map<string, GeneratedSection>,
  brief: string
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check section count
  const allSectionDefs = [...BRIEF_SECTIONS, BUILD_ORDER_SECTION_DEF];
  const expectedCount = allSectionDefs.length;
  if (sections.size < expectedCount) {
    issues.push(
      `Missing sections: ${expectedCount - sections.size} of ${expectedCount}`
    );
  }

  // Check email count
  const emailSection = sections.get('email_campaign');
  if (emailSection) {
    const emailMatches = emailSection.content.match(/\*\*Email \d/g);
    const emailCount = emailMatches ? emailMatches.length : 0;
    if (emailCount < 9) {
      issues.push(`Only ${emailCount} emails found (expected 9)`);
    }
  }

  // Check ad angle count
  const adsSection = sections.get('paid_ads');
  if (adsSection) {
    const angleMatches = adsSection.content.match(/\*\*Angle \d/g);
    const angleCount = angleMatches ? angleMatches.length : 0;
    if (angleCount < 6) {
      issues.push(`Only ${angleCount} ad angles found (expected 6+)`);
    }
  }

  // Check reel count
  const reelSection = sections.get('reel_scripts');
  if (reelSection) {
    const reelMatches = reelSection.content.match(/### Reel \d/g);
    const reelCount = reelMatches ? reelMatches.length : 0;
    if (reelCount < 6) {
      issues.push(`Only ${reelCount} reel scripts found (expected 6+)`);
    }
  }

  // Check line count
  const lineCount = brief.split('\n').length;
  if (lineCount < 400) {
    issues.push(`Brief is only ${lineCount} lines (expected 500+)`);
  }
  if (lineCount > 1200) {
    issues.push(`Brief is ${lineCount} lines (unusually long, expected under 1000)`);
  }

  // Check for stray placeholders
  const placeholderMatches = brief.match(/\[(?:PLACEHOLDER|TBD|INSERT|TODO)\]/gi);
  if (placeholderMatches && placeholderMatches.length > 0) {
    // Allow them only in decisions-needed section
    const decisionsSection = sections.get('decisions_needed');
    const decisionsContent = decisionsSection?.content || '';
    for (const match of placeholderMatches) {
      if (!decisionsContent.includes(match)) {
        issues.push(`Stray placeholder found: ${match}`);
      }
    }
  }

  // Check for truncated sections
  for (const [, section] of sections) {
    if (section.truncated) {
      issues.push(`Section "${section.name}" was truncated`);
    }
  }

  return { valid: issues.length === 0, issues };
}
