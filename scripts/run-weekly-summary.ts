#!/usr/bin/env tsx
// Send the Monday Slack digest. Run on a cron at 08:00 Mondays.
//   npm run publish:weekly
//   npm run publish:weekly -- --start=2026-04-20

import { sendWeeklySummary } from '../src/publisher/weekly-summary.js';

async function main() {
  const args = process.argv.slice(2);
  const startArg = args.find((a) => a.startsWith('--start='));
  const start = startArg ? new Date(startArg.split('=')[1]) : undefined;
  const result = await sendWeeklySummary(start);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
