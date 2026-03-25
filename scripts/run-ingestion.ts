#!/usr/bin/env tsx
// CLI: Ingest a new file into the knowledge base
// Usage:
//   npm run ingest -- --file ./path/to/file.md --type workshop --title "Workshop Name"
//   npm run ingest -- --url "https://youtube.com/watch?v=..." --type video --title "Video Title"
//   npm run ingest -- --dir ./path/to/markdown/dir --type workshop

import { ingestFile, ingestMarkdownDirectory } from '../src/ingestion/ingest.js';

function parseArgs(): {
  file?: string;
  url?: string;
  dir?: string;
  type: string;
  title: string;
} {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    parsed[key] = args[i + 1];
  }

  if (!parsed.type) {
    console.error(
      'Usage: npm run ingest -- --file <path> --type <type> --title <title>'
    );
    console.error(
      '       npm run ingest -- --url <url> --type <type> --title <title>'
    );
    console.error(
      '       npm run ingest -- --dir <path> --type <type>'
    );
    console.error(
      '\nTypes: podcast, video, book, workshop, email, linkedin'
    );
    process.exit(1);
  }

  return {
    file: parsed.file,
    url: parsed.url,
    dir: parsed.dir,
    type: parsed.type,
    title: parsed.title || '',
  };
}

async function main() {
  const args = parseArgs();

  try {
    if (args.dir) {
      await ingestMarkdownDirectory(
        args.dir,
        args.type as any
      );
    } else {
      const result = await ingestFile({
        title: args.title,
        sourceType: args.type as any,
        filePath: args.file,
        url: args.url,
      });

      console.log(`\nDocument ID: ${result.documentId}`);
      console.log(`Chunks created: ${result.chunksCreated}`);
    }
  } catch (error) {
    console.error('Ingestion failed:', error);
    process.exit(1);
  }
}

main();
