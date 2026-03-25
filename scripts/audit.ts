#!/usr/bin/env tsx
// CLI: Show ingestion status and gap analysis
// Usage: npm run audit

import { auditExistingContent } from '../src/ingestion/audit.js';

async function main() {
  try {
    await auditExistingContent();
  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

main();
