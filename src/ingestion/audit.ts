// Scans GitHub repos + Supabase and outputs a gap analysis
// Step 1 of ingestion: check what already exists before processing anything

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AuditResult {
  supabaseDocuments: Array<{
    id: string;
    title: string;
    source_type: string;
    status: string;
    word_count: number | null;
  }>;
  chunkCount: number;
  sourceTypeCounts: Record<string, number>;
  missingContent: string[];
}

// All content sources from the brief's priority list
const EXPECTED_CONTENT = [
  { title: 'Existing GitHub markdown files', source_type: 'workshop', priority: 1 },
  { title: "Greg's book", source_type: 'book', priority: 2 },
  { title: 'Workshop recordings', source_type: 'video', priority: 3 },
  { title: 'Podcast episodes', source_type: 'podcast', priority: 4 },
  { title: 'Past email newsletters', source_type: 'email', priority: 5 },
  { title: 'Top LinkedIn posts', source_type: 'linkedin', priority: 6 },
  { title: 'Webinar recordings', source_type: 'video', priority: 7 },
];

export async function auditExistingContent(): Promise<AuditResult> {
  console.log('=== Greg Brain Content Audit ===\n');

  // 1. Check source_documents table
  const { data: documents, error: docError } = await supabase
    .from('greg_source_documents')
    .select('id, title, source_type, status, word_count')
    .order('processed_at', { ascending: false });

  if (docError) {
    // Table might not exist yet
    if (docError.code === '42P01') {
      console.log('source_documents table does not exist yet. Run schema.sql first.');
      return {
        supabaseDocuments: [],
        chunkCount: 0,
        sourceTypeCounts: {},
        missingContent: EXPECTED_CONTENT.map((c) => c.title),
      };
    }
    throw docError;
  }

  console.log(`Found ${documents?.length || 0} documents in source_documents table\n`);

  // 2. Count chunks
  const { count: chunkCount, error: chunkError } = await supabase
    .from('greg_content_chunks')
    .select('*', { count: 'exact', head: true });

  if (chunkError && chunkError.code !== '42P01') {
    throw chunkError;
  }

  console.log(`Total chunks in content_chunks: ${chunkCount || 0}\n`);

  // 3. Count by source type
  const sourceTypeCounts: Record<string, number> = {};
  if (documents) {
    for (const doc of documents) {
      sourceTypeCounts[doc.source_type] = (sourceTypeCounts[doc.source_type] || 0) + 1;
    }
  }

  console.log('Documents by source type:');
  for (const [type, count] of Object.entries(sourceTypeCounts)) {
    console.log(`  ${type}: ${count}`);
  }
  if (Object.keys(sourceTypeCounts).length === 0) {
    console.log('  (none)');
  }

  // 4. Gap analysis
  const existingTypes = new Set(Object.keys(sourceTypeCounts));
  const missingContent = EXPECTED_CONTENT.filter(
    (c) => !existingTypes.has(c.source_type)
  ).map((c) => c.title);

  console.log('\n--- Gap Analysis ---');
  if (missingContent.length > 0) {
    console.log('Missing content types:');
    for (const missing of missingContent) {
      console.log(`  - ${missing}`);
    }
  } else {
    console.log('All content types have at least one document ingested.');
  }

  // 5. List each document
  if (documents && documents.length > 0) {
    console.log('\n--- Ingested Documents ---');
    for (const doc of documents) {
      console.log(
        `  [${doc.source_type}] ${doc.title} (${doc.word_count || '?'} words) - ${doc.status}`
      );
    }
  }

  return {
    supabaseDocuments: documents || [],
    chunkCount: chunkCount || 0,
    sourceTypeCounts,
    missingContent,
  };
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  auditExistingContent()
    .then((result) => {
      console.log('\n=== Audit Complete ===');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(console.error);
}
