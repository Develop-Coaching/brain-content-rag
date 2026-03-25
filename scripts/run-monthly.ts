#!/usr/bin/env tsx
// CLI: Trigger monthly content planning
// Usage:
//   npm run monthly                    # Plan for current month
//   npm run monthly -- --month 2026-04 # Plan for a specific month

import { runMonthlyPlanning, notifyChloe } from '../src/agent/planner.js';

function parseMonth(): Date {
  const args = process.argv.slice(2);
  const monthIdx = args.indexOf('--month');

  if (monthIdx !== -1 && args[monthIdx + 1]) {
    const [year, month] = args[monthIdx + 1].split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  // Default: current month
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function main() {
  const month = parseMonth();

  try {
    const result = await runMonthlyPlanning(month);

    console.log(`\nCalendar ID: ${result.calendarId}`);
    console.log(`Posts created: ${result.postsCreated}`);

    // Send Slack notification
    await notifyChloe(month);

    console.log('\nDone. Posts are in draft status waiting for review.');
  } catch (error) {
    console.error('Monthly planning failed:', error);
    process.exit(1);
  }
}

main();
