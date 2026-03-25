// Hybrid search across ALL content tables in Supabase
// Searches: training_chunks (1685), chunks (1969), greg_content_chunks (new)
// Uses vector similarity via Supabase RPC + client-side merging

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SearchResult {
  id: string;
  content: string;
  source_table: string;
  source_title: string;
  framework_tags: string[];
  topic_tags: string[];
  combined_score: number;
}

// Map training_chunks sections to framework tags
const SECTION_TO_FRAMEWORK: Record<string, string> = {
  'Plan': 'plan',
  'Attract': 'attract',
  'Convert': 'convert',
  'Deliver': 'deliver',
  'Scale': 'scale',
  'Week 1': 'plan',
};

export async function hybridSearch(
  query: string,
  matchCount: number = 10,
  frameworkFilter?: string,
  topicFilter?: string
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;
  const allResults: SearchResult[] = [];

  // 1. Search training_chunks (core training modules - has embeddings + sections)
  const trainingQuery = supabase.rpc('match_training_chunks', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });

  const { data: trainingData, error: trainingError } = await trainingQuery;

  if (!trainingError && trainingData) {
    for (const row of trainingData) {
      const framework = SECTION_TO_FRAMEWORK[row.section] || '';
      if (frameworkFilter && framework !== frameworkFilter) continue;

      allResults.push({
        id: row.id,
        content: row.chunk_text || row.content || '',
        source_table: 'training_chunks',
        source_title: row.module_title || '',
        framework_tags: framework ? [framework] : [],
        topic_tags: [],
        combined_score: row.similarity || 0,
      });
    }
  }

  // 2. Search chunks (video transcript chunks - has embeddings)
  // Use RPC if available, otherwise fall back to client-side
  const { data: chunkData, error: chunkError } = await supabase.rpc(
    'match_chunks',
    {
      query_embedding: queryEmbedding,
      match_count: matchCount,
    }
  );

  if (!chunkError && chunkData) {
    for (const row of chunkData) {
      allResults.push({
        id: row.id,
        content: row.text || row.content || '',
        source_table: 'chunks',
        source_title: row.title || '',
        framework_tags: [],
        topic_tags: [],
        combined_score: row.similarity || 0,
      });
    }
  }

  // 3. Search greg_content_chunks (new content from this project)
  const { data: gregData, error: gregError } = await supabase.rpc(
    'hybrid_search',
    {
      query_text: query,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      framework_filter: frameworkFilter || null,
      topic_filter: topicFilter || null,
    }
  );

  if (!gregError && gregData) {
    for (const row of gregData) {
      allResults.push({
        id: row.id,
        content: row.content || '',
        source_table: 'greg_content_chunks',
        source_title: '',
        framework_tags: row.framework_tags || [],
        topic_tags: row.topic_tags || [],
        combined_score: row.combined_score || 0,
      });
    }
  }

  // Sort by score descending, take top matchCount
  allResults.sort((a, b) => b.combined_score - a.combined_score);
  return allResults.slice(0, matchCount);
}

export async function searchByFramework(
  framework: string,
  query: string,
  limit: number = 5
): Promise<SearchResult[]> {
  return hybridSearch(query, limit, framework);
}

export async function getContentVariety(
  limit: number = 5
): Promise<Record<string, SearchResult[]>> {
  const frameworks = ['plan', 'attract', 'convert', 'deliver', 'scale'];
  const queries: Record<string, string> = {
    plan: 'planning systems business foundations strategy',
    attract: 'lead generation architects marketing visibility',
    convert: 'sales conversion quoting pricing proposals',
    deliver: 'project delivery systems subcontractors quality',
    scale: 'scaling team hiring growth business expansion',
  };

  const results: Record<string, SearchResult[]> = {};

  for (const framework of frameworks) {
    results[framework] = await hybridSearch(
      queries[framework],
      limit,
      framework
    );
  }

  return results;
}
