#!/usr/bin/env tsx
// CLI: Generate monthly workshop brief + lead magnet
// Usage:
//   npm run workshop                                    # Generate for next month (auto theme)
//   npm run workshop -- --month 2026-05                 # Generate for specific month
//   npm run workshop -- --theme "Pricing Mastery"       # Force a specific theme
//   npm run workshop -- --lead-magnet-format checklist   # Force lead magnet format
//   npm run workshop -- --dry-run                       # Generate but don't write files/notify
//   npm run workshop -- --force                         # Regenerate even if progress exists
//   npm run workshop -- --brief-only                    # Skip lead magnet generation
//   npm run workshop -- --lead-magnet-only              # Skip brief generation

import { runWorkshopGeneration } from '../src/workshop/generator.js';
import type { WorkshopGeneratorOptions, LeadMagnetFormat } from '../src/workshop/types.js';

const VALID_LM_FORMATS: LeadMagnetFormat[] = [
  'ebook',
  'checklist',
  'email-course',
  'calculator',
  'quiz',
];

function parseArgs(): WorkshopGeneratorOptions {
  const args = process.argv.slice(2);

  // Parse --month YYYY-MM
  const monthIdx = args.indexOf('--month');
  let month: Date;
  if (monthIdx !== -1 && args[monthIdx + 1]) {
    const [year, m] = args[monthIdx + 1].split('-').map(Number);
    month = new Date(year, m - 1, 1);
  } else {
    // Default to next month
    const now = new Date();
    month = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // Parse --theme "Theme Name"
  const themeIdx = args.indexOf('--theme');
  const themeOverride =
    themeIdx !== -1 && args[themeIdx + 1] ? args[themeIdx + 1] : undefined;

  // Parse --lead-magnet-format
  const lmIdx = args.indexOf('--lead-magnet-format');
  let leadMagnetFormatOverride: LeadMagnetFormat | undefined;
  if (lmIdx !== -1 && args[lmIdx + 1]) {
    const fmt = args[lmIdx + 1] as LeadMagnetFormat;
    if (VALID_LM_FORMATS.includes(fmt)) {
      leadMagnetFormatOverride = fmt;
    } else {
      console.error(
        `Invalid lead magnet format: "${fmt}". Valid: ${VALID_LM_FORMATS.join(', ')}`
      );
      process.exit(1);
    }
  }

  return {
    month,
    themeOverride,
    leadMagnetFormatOverride,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    briefOnly: args.includes('--brief-only'),
    leadMagnetOnly: args.includes('--lead-magnet-only'),
  };
}

async function main() {
  const options = parseArgs();

  try {
    await runWorkshopGeneration(options);
  } catch (error: any) {
    console.error('\nWorkshop generation failed:', error.message || error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
