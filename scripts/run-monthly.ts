#!/usr/bin/env tsx
// CLI: Trigger monthly content planning + image generation
// Usage:
//   npm run monthly                       # Plan + generate images for current month
//   npm run monthly -- --month 2026-04    # Plan + images for a specific month
//   npm run monthly -- --no-images        # Plan only, skip image generation
//   npm run images -- --month 2026-04     # Images only (posts must already exist)

import { runMonthlyPlanning, notifyChloe } from '../src/agent/planner.js';
import {
  generateImagesForCalendar,
  generateImagesForMonth,
  type ImageGenerationResult,
} from '../src/agent/image-generator.js';

function parseArgs(): {
  month: Date;
  imagesOnly: boolean;
  noImages: boolean;
} {
  const args = process.argv.slice(2);
  const monthIdx = args.indexOf('--month');

  let month: Date;
  if (monthIdx !== -1 && args[monthIdx + 1]) {
    const [year, m] = args[monthIdx + 1].split('-').map(Number);
    month = new Date(year, m - 1, 1);
  } else {
    const now = new Date();
    month = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    month,
    imagesOnly: args.includes('--images-only'),
    noImages: args.includes('--no-images'),
  };
}

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const { month, imagesOnly, noImages } = parseArgs();
  const monthKey = formatMonthKey(month);

  let imageResult: ImageGenerationResult | null = null;

  if (imagesOnly) {
    // --images-only: skip content generation, just generate images
    console.log(`\nGenerating images only for ${monthKey}...\n`);

    try {
      imageResult = await generateImagesForMonth(monthKey);
    } catch (error) {
      console.error('Image generation failed:', error);
      process.exit(1);
    }
  } else {
    // Full pipeline: content + images
    try {
      const result = await runMonthlyPlanning(month);

      console.log(`\nCalendar ID: ${result.calendarId}`);
      console.log(`Posts created: ${result.postsCreated}`);

      // Generate images unless --no-images
      if (!noImages) {
        console.log('\nStarting image generation...');
        try {
          imageResult = await generateImagesForCalendar(result.calendarId, monthKey);
        } catch (imgError) {
          console.error('Image generation failed (content was saved):', imgError);
          console.log('Run again with --images-only to retry image generation.');
        }
      }

      // Send Slack notification
      await notifyChloe(month, imageResult);

      console.log('\nDone. Posts are in draft status waiting for review.');
    } catch (error) {
      console.error('Monthly planning failed:', error);
      process.exit(1);
    }
  }

  // Print summary
  if (imageResult) {
    console.log('\n--- Image Summary ---');
    console.log(`  Posts: ${imageResult.totalPosts}`);
    console.log(`  Images generated: ${imageResult.imagesGenerated}`);
    console.log(`  Skipped: ${imageResult.skipped}`);
    console.log(`  Failed: ${imageResult.failed}`);
    if (imageResult.failures.length > 0) {
      console.log('  Failures:');
      for (const f of imageResult.failures) {
        console.log(`    - ${f.platform} (${f.postId.slice(0, 8)}): ${f.error}`);
      }
    }
  }
}

main();
