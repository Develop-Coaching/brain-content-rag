// Main ingestion orchestrator
// Handles: markdown files, PDFs, DOCX, transcripts, plain text
// Pipeline: parse -> chunk -> tag -> embed -> store

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import { chunkDocument, type Chunk } from './chunk.js';
import { generateEmbedding, tagChunk } from './embed.js';
import { transcribeAudio, downloadAndTranscribe } from './transcribe.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type SourceType = 'podcast' | 'video' | 'book' | 'workshop' | 'email' | 'linkedin';

interface IngestOptions {
  title: string;
  sourceType: SourceType;
  filePath?: string;
  url?: string;
  githubPath?: string;
  metadata?: Record<string, unknown>;
}

// Extract text from different file formats
async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.md':
    case '.txt':
    case '.html':
      return fs.readFileSync(filePath, 'utf-8');

    case '.pdf': {
      // Use pdf-parse or pdfplumber via a subprocess
      const { execSync } = await import('child_process');
      try {
        // Try python pdfplumber first (more reliable for complex PDFs)
        const result = execSync(
          `python3 -c "import pdfplumber; pdf = pdfplumber.open('${filePath}'); print('\\n'.join(p.extract_text() or '' for p in pdf.pages)); pdf.close()"`,
          { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
        );
        return result;
      } catch {
        // Fallback: use PyPDF2
        const result = execSync(
          `python3 -c "from PyPDF2 import PdfReader; r = PdfReader('${filePath}'); print('\\n'.join(p.extract_text() or '' for p in r.pages))"`,
          { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
        );
        return result;
      }
    }

    case '.docx': {
      const { execSync } = await import('child_process');
      const result = execSync(
        `python3 -c "from docx import Document; d = Document('${filePath}'); print('\\n'.join(p.text for p in d.paragraphs))"`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );
      return result;
    }

    case '.mp3':
    case '.mp4':
    case '.m4a':
    case '.wav':
      return await transcribeAudio(filePath);

    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

export async function ingestFile(options: IngestOptions): Promise<{
  documentId: string;
  chunksCreated: number;
}> {
  const { title, sourceType, filePath, url, githubPath, metadata } = options;

  console.log(`\n=== Ingesting: ${title} ===`);
  console.log(`Source type: ${sourceType}`);

  // 1. Get the raw text
  let rawText: string;
  let resolvedTitle = title;

  if (filePath) {
    console.log(`Extracting text from: ${filePath}`);
    rawText = await extractText(filePath);
  } else if (url) {
    console.log(`Downloading and transcribing from: ${url}`);
    const result = await downloadAndTranscribe(url);
    rawText = result.transcript;
    resolvedTitle = resolvedTitle || result.title;
  } else {
    throw new Error('Either filePath or url must be provided');
  }

  const wordCount = rawText.split(/\s+/).length;
  console.log(`Extracted ${wordCount} words`);

  // 2. Register in source_documents
  const { data: docData, error: docError } = await supabase
    .from('greg_source_documents')
    .insert({
      title: resolvedTitle,
      source_type: sourceType,
      file_path: filePath || url,
      github_path: githubPath,
      word_count: wordCount,
      metadata: metadata || {},
    })
    .select('id')
    .single();

  if (docError) throw new Error(`Failed to create source document: ${docError.message}`);
  const documentId = docData.id;
  console.log(`Created source document: ${documentId}`);

  // 3. Chunk the content
  const sourceTypeForChunking =
    sourceType === 'workshop' || githubPath?.endsWith('.md')
      ? 'markdown'
      : 'transcript';
  const chunks: Chunk[] = chunkDocument(rawText, sourceTypeForChunking);
  console.log(`Created ${chunks.length} chunks`);

  // 4. Tag, embed, and store each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    // Auto-tag with Claude
    const tags = await tagChunk(chunk.content);

    // Generate embedding
    const embedding = await generateEmbedding(chunk.content);

    // Store in Supabase
    const { error: chunkError } = await supabase
      .from('greg_content_chunks')
      .insert({
        document_id: documentId,
        chunk_index: i,
        content: chunk.content,
        embedding,
        topic_tags: tags.topics,
        framework_tags: tags.frameworks,
      });

    if (chunkError) {
      console.error(`Failed to store chunk ${i}: ${chunkError.message}`);
    }

    // Rate limit delay
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  console.log(`\nIngestion complete: ${chunks.length} chunks stored for "${resolvedTitle}"`);

  return { documentId, chunksCreated: chunks.length };
}

export async function ingestMarkdownDirectory(
  dirPath: string,
  sourceType: SourceType = 'workshop'
): Promise<void> {
  const files = fs
    .readdirSync(dirPath, { recursive: true })
    .filter((f) => String(f).endsWith('.md'))
    .map((f) => String(f));

  console.log(`Found ${files.length} markdown files in ${dirPath}`);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const title = path.basename(file, '.md').replace(/-/g, ' ').replace(/_/g, ' ');

    await ingestFile({
      title,
      sourceType,
      filePath: fullPath,
      githubPath: file,
    });
  }
}

export async function ingestPlainText(
  text: string,
  title: string,
  sourceType: SourceType,
  metadata?: Record<string, unknown>
): Promise<{ documentId: string; chunksCreated: number }> {
  return ingestFile({
    title,
    sourceType,
    filePath: undefined,
    url: undefined,
    metadata,
  });
}
