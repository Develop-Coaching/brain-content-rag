// OpenAI embeddings generation
// Uses text-embedding-3-small (1536 dimensions)

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  // OpenAI supports batch embedding - up to 2048 inputs
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(
      `  Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`
    );

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });

    for (const item of response.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

export interface ChunkTags {
  frameworks: string[];
  topics: string[];
}

export async function tagChunk(chunkText: string): Promise<ChunkTags> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Tag this content chunk with relevant categories.

Framework tags (pick all that apply): plan, attract, convert, deliver, scale

Topic tags (pick all that apply): pricing, leads, architects, subcontractors, cashflow, systems, hiring, marketing, sales, project_management, mindset, growth

Content:
${chunkText}

Respond in JSON only: { "frameworks": [], "topics": [] }`,
      },
    ],
  });

  try {
    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text);
  } catch {
    console.warn('Failed to parse tags, using empty arrays');
    return { frameworks: [], topics: [] };
  }
}

export async function tagChunks(
  chunks: string[]
): Promise<ChunkTags[]> {
  const tags: ChunkTags[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`  Tagging chunk ${i + 1}/${chunks.length}`);
    const chunkTags = await tagChunk(chunks[i]);
    tags.push(chunkTags);

    // Small delay to respect rate limits
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return tags;
}
