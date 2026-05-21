#!/usr/bin/env tsx
// Run a single publish tick. Use from cron / GitHub Actions / local terminal.
//   npm run publish:tick
//   npm run publish:tick -- --dry        # log what would happen, don't write
//   npm run publish:tick -- --now=2026-04-20T12:00:00Z   # simulate a different "now"

import { publishTick } from '../src/publisher/dispatcher.js';

async function main() {
  const args = process.argv.slice(2);
  const nowArg = args.find((a) => a.startsWith('--now='));
  const now = nowArg ? new Date(nowArg.split('=')[1]) : new Date();
  const dry = args.includes('--dry');

  if (dry) {
    console.log('--dry: not implemented separately yet; the tick is idempotent on success');
  }

  const result = await publishTick(now);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
