// Main orchestrator for the Monthly Workshop Generator
// Ties together: theme selection -> brief generation -> lead magnet -> file output -> Slack

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { scanExistingWorkshops, selectTheme } from './theme-selector.js';
import {
  generateAllSections,
  assembleBrief,
  validateCompleteness,
} from './section-generator.js';
import { generateLeadMagnet } from './lead-magnet.js';
import type {
  WorkshopGeneratorOptions,
  GenerationResult,
  GenerationProgress,
  WorkshopConfig,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSHOPS_DIR = path.resolve(__dirname, '../../../../Workshops');

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getOutputDir(config: WorkshopConfig): string {
  const monthName = new Date(
    parseInt(config.monthKey.split('-')[0]),
    parseInt(config.monthKey.split('-')[1]) - 1,
    1
  ).toLocaleString('default', { month: 'long' });

  const folderName = `${monthName} Workshop - ${config.subtitle}`;
  return path.join(WORKSHOPS_DIR, folderName);
}

function getProgressPath(outputDir: string): string {
  return path.join(outputDir, '.progress.json');
}

function loadProgress(outputDir: string): GenerationProgress | undefined {
  const progressPath = getProgressPath(outputDir);
  try {
    if (fs.existsSync(progressPath)) {
      const data = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
      return data as GenerationProgress;
    }
  } catch {
    // Corrupt progress file, start fresh
  }
  return undefined;
}

function saveProgress(
  outputDir: string,
  config: WorkshopConfig,
  sections: Map<string, { id: string; content: string }>,
  leadMagnetDone: boolean,
  startedAt: string
): void {
  const progress: GenerationProgress = {
    monthKey: config.monthKey,
    themeSlug: config.themeSlug,
    workshopConfig: config,
    completedSections: [...sections.keys()],
    generatedContent: Object.fromEntries(
      [...sections.entries()].map(([k, v]) => [k, v.content])
    ),
    leadMagnetDone,
    startedAt,
    lastUpdatedAt: new Date().toISOString(),
  };

  ensureDir(outputDir);
  fs.writeFileSync(getProgressPath(outputDir), JSON.stringify(progress, null, 2));
}

function splitEmails(
  emailSectionContent: string
): Map<string, string> {
  const emails = new Map<string, string>();

  // Split by email headers (e.g. **Email 1 - Announcement**)
  const emailBlocks = emailSectionContent.split(/(?=\*\*Email \d)/);

  for (const block of emailBlocks) {
    const headerMatch = block.match(
      /\*\*Email (\d+)\s*-\s*([^*]+)\*\*/
    );
    if (headerMatch) {
      const num = headerMatch[1].padStart(2, '0');
      const name = headerMatch[2]
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_');
      emails.set(`Email_${num}_${name}.md`, block.trim());
    }
  }

  return emails;
}

export async function runWorkshopGeneration(
  options: WorkshopGeneratorOptions
): Promise<GenerationResult> {
  const totalStart = Date.now();
  const startedAt = new Date().toISOString();

  console.log(
    `\n=== Workshop Generator: ${options.month.toLocaleString('default', { month: 'long', year: 'numeric' })} ===\n`
  );

  if (options.dryRun) {
    console.log('  (DRY RUN - will generate but not write files or notify Slack)\n');
  }

  // Step 1: Scan existing workshops
  console.log('[1/8] Scanning existing workshops...');
  const existing = scanExistingWorkshops();
  console.log(
    `  Found ${existing.length} existing: ${existing.join(', ') || 'none'}`
  );

  // Step 2-3: Select theme
  const config = await selectTheme(options.month, options.themeOverride);
  const outputDir = getOutputDir(config);

  // Check for existing progress (resume support)
  let progress: GenerationProgress | undefined;
  if (!options.force) {
    progress = loadProgress(outputDir);
    if (progress && progress.completedSections.length > 0) {
      console.log(
        `\n  Found existing progress (${progress.completedSections.length} sections). Resuming...`
      );
      console.log('  (Use --force to regenerate from scratch)');
    }
  }

  // Step 4-5: Generate brief sections
  let sections: Map<string, any>;
  let totalAutoFixes: number;
  let totalWarnings: string[];
  let brief: string;

  if (options.leadMagnetOnly) {
    // Skip brief generation
    console.log('\n  Skipping brief generation (--lead-magnet-only)');
    sections = new Map();
    totalAutoFixes = 0;
    totalWarnings = [];
    brief = '';
  } else {
    const result = await generateAllSections(config, progress);
    sections = result.sections;
    totalAutoFixes = result.totalAutoFixes;
    totalWarnings = result.totalWarnings;

    // Save progress after each section batch
    saveProgress(outputDir, config, sections, false, startedAt);

    // Brand validation summary
    console.log(`\n[5/8] Brand validation summary...`);
    console.log(
      `  ${totalAutoFixes} auto-fixed, ${totalWarnings.length} warning(s)`
    );
    for (const warning of totalWarnings.slice(0, 5)) {
      console.log(`  - ${warning}`);
    }
    if (totalWarnings.length > 5) {
      console.log(`  ... and ${totalWarnings.length - 5} more`);
    }

    // Assemble brief
    brief = assembleBrief(config, sections);

    // Validate completeness
    const completeness = validateCompleteness(sections, brief);
    if (!completeness.valid) {
      console.log('\n  Completeness issues:');
      for (const issue of completeness.issues) {
        console.log(`  - ${issue}`);
      }
    }

    const lineCount = brief.split('\n').length;
    console.log(`\n[6/8] ${options.dryRun ? 'Would write' : 'Writing'} brief (${lineCount} lines)...`);

    if (!options.dryRun) {
      // Write the main brief
      ensureDir(outputDir);
      const briefFilename = `${config.themeSlug.replace(/-/g, '_')}_Marketing_Brief.md`;
      fs.writeFileSync(path.join(outputDir, briefFilename), brief);
      console.log(`  -> ${path.relative(process.cwd(), path.join(outputDir, briefFilename))}`);

      // Write individual email files
      const emailSection = sections.get('email_campaign');
      if (emailSection) {
        const emailDir = path.join(outputDir, 'emails');
        ensureDir(emailDir);
        const emailFiles = splitEmails(emailSection.content);
        for (const [filename, content] of emailFiles) {
          fs.writeFileSync(path.join(emailDir, filename), content);
        }
        console.log(`  -> ${emailFiles.size} email files written to emails/`);
      }

      // Write decisions-needed as standalone file
      const decisionsSection = sections.get('decisions_needed');
      if (decisionsSection) {
        fs.writeFileSync(
          path.join(outputDir, 'decisions-needed.md'),
          decisionsSection.content
        );
      }
    }
  }

  // Step 7: Generate lead magnet
  let leadMagnetResult = null;

  if (!options.briefOnly) {
    const leadMagnet = await generateLeadMagnet(
      config,
      options.leadMagnetFormatOverride
    );

    leadMagnetResult = leadMagnet.config;

    if (!options.dryRun) {
      const lmDir = path.join(outputDir, 'Lead_Magnet');
      ensureDir(lmDir);

      // Write content
      fs.writeFileSync(
        path.join(lmDir, `${leadMagnet.config.slug}.md`),
        leadMagnet.content
      );

      // Write format notes
      fs.writeFileSync(
        path.join(lmDir, 'format-notes.md'),
        leadMagnet.formatNotes
      );

      // Write delivery notes
      fs.writeFileSync(
        path.join(lmDir, 'delivery-notes.md'),
        leadMagnet.deliveryNotes
      );

      // Write social hooks
      fs.writeFileSync(
        path.join(lmDir, 'social-hooks.md'),
        leadMagnet.socialHooks
      );

      // Write metadata
      fs.writeFileSync(
        path.join(lmDir, 'metadata.json'),
        JSON.stringify(leadMagnet.config, null, 2)
      );

      // Write individual email files for email-course format
      if (leadMagnet.emailFiles) {
        const emailDir = path.join(lmDir, 'emails');
        ensureDir(emailDir);
        for (const [filename, content] of leadMagnet.emailFiles) {
          fs.writeFileSync(path.join(emailDir, filename), content);
        }
      }

      console.log(`  -> ${path.relative(process.cwd(), lmDir)}/`);
    }

    // Update progress
    saveProgress(outputDir, config, sections, true, startedAt);
  }

  // Step 8: Slack notification
  if (!options.dryRun) {
    console.log('\n[8/8] Sending Slack notification...');
    await notifyWorkshopComplete(config, outputDir, totalWarnings, leadMagnetResult);
  } else {
    console.log('\n[8/8] Slack notification skipped (dry run)');
  }

  // Count metrics
  const emailSection = sections.get('email_campaign');
  const emailMatches = emailSection?.content?.match(/\*\*Email \d/g);
  const adsSection = sections.get('paid_ads');
  const adMatches = adsSection?.content?.match(/\*\*Angle \d/g);
  const reelSection = sections.get('reel_scripts');
  const reelMatches = reelSection?.content?.match(/### Reel \d/g);

  const totalTime = Date.now() - totalStart;

  const result: GenerationResult = {
    workshopConfig: config,
    outputPath: outputDir,
    briefLineCount: brief.split('\n').length,
    sectionCount: sections.size,
    emailCount: emailMatches?.length || 0,
    adAngleCount: adMatches?.length || 0,
    reelCount: reelMatches?.length || 0,
    leadMagnet: leadMagnetResult,
    warnings: totalWarnings,
    totalTimeMs: totalTime,
  };

  // Print summary
  console.log(`\nDone. Total: ${(totalTime / 1000).toFixed(0)}s.`);
  if (brief) {
    console.log(
      `  Brief: ${result.briefLineCount} lines, ${result.sectionCount} sections, ${result.emailCount} emails, ${result.adAngleCount} ad angles, ${result.reelCount} reels`
    );
  }
  if (leadMagnetResult) {
    console.log(
      `  Lead magnet: "${leadMagnetResult.title}" (${leadMagnetResult.format})`
    );
  }
  if (!options.dryRun) {
    console.log(`  Output: ${outputDir}`);
  }

  // Clean up progress file on success
  if (!options.dryRun) {
    const progressPath = getProgressPath(outputDir);
    if (fs.existsSync(progressPath)) {
      fs.unlinkSync(progressPath);
    }
  }

  return result;
}

async function notifyWorkshopComplete(
  config: WorkshopConfig,
  outputDir: string,
  warnings: string[],
  leadMagnet: { format: string; title: string } | null
): Promise<void> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CONTENT_CHANNEL_ID;

  if (!slackToken || !channelId) {
    console.log(
      '  Slack not configured - skipping. Set SLACK_BOT_TOKEN and SLACK_CONTENT_CHANNEL_ID.'
    );
    return;
  }

  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(slackToken);

  let text = `Workshop brief generated for ${config.monthName}.\n\n`;
  text += `*${config.title}*\n`;
  text += `Date: ${config.dateSuggestion} | Price: GBP ${config.priceGbp} (AUD ${config.priceAud})\n`;
  text += `Theme: ${config.justification.slice(0, 150)}\n`;

  if (leadMagnet) {
    text += `\nLead magnet: "${leadMagnet.title}" (${leadMagnet.format})\n`;
  }

  if (warnings.length > 0) {
    text += `\n${warnings.length} warning(s) to review.\n`;
  }

  text += `\nOutput: ${outputDir}`;

  try {
    await slack.chat.postMessage({
      channel: channelId,
      text,
    });
    console.log('  Notification sent.');
  } catch (err: any) {
    console.log(`  Slack notification failed: ${err.message?.slice(0, 80)}`);
  }
}
