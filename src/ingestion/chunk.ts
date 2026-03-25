// Chunking logic for different content types
// Target: 400-600 tokens per chunk, 50 token overlap
// Never splits mid-sentence

export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenEstimate: number;
}

// Rough token estimate: ~4 chars per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitIntoSentences(text: string): string[] {
  // Split on sentence boundaries while keeping the delimiter
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
}

export function chunkByMarkdownHeadings(text: string): Chunk[] {
  // Split by ## headings first, then sub-chunk if section > 600 tokens
  const sections = text.split(/(?=^#{1,3}\s)/m);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const tokens = estimateTokens(trimmed);

    if (tokens <= 600) {
      chunks.push({
        content: trimmed,
        chunkIndex: chunks.length,
        tokenEstimate: tokens,
      });
    } else {
      // Sub-chunk large sections by paragraphs
      const subChunks = chunkByParagraphs(trimmed, { maxTokens: 500, overlap: 50 });
      for (const sub of subChunks) {
        sub.chunkIndex = chunks.length;
        chunks.push(sub);
      }
    }
  }

  return chunks;
}

export function chunkByParagraphs(
  text: string,
  options: { maxTokens: number; overlap: number } = { maxTokens: 500, overlap: 50 }
): Chunk[] {
  const { maxTokens, overlap } = options;
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: Chunk[] = [];

  let currentChunk = '';
  let overlapBuffer = '';

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    // If a single paragraph exceeds max, split by sentences
    if (paragraphTokens > maxTokens) {
      // Flush current chunk first
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex: chunks.length,
          tokenEstimate: estimateTokens(currentChunk),
        });
        overlapBuffer = extractOverlap(currentChunk, overlap);
        currentChunk = '';
      }

      const sentences = splitIntoSentences(paragraph);
      let sentenceChunk = overlapBuffer;

      for (const sentence of sentences) {
        const combined = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;

        if (estimateTokens(combined) > maxTokens && sentenceChunk.trim()) {
          chunks.push({
            content: sentenceChunk.trim(),
            chunkIndex: chunks.length,
            tokenEstimate: estimateTokens(sentenceChunk),
          });
          overlapBuffer = extractOverlap(sentenceChunk, overlap);
          sentenceChunk = overlapBuffer ? `${overlapBuffer} ${sentence}` : sentence;
        } else {
          sentenceChunk = combined;
        }
      }

      if (sentenceChunk.trim()) {
        currentChunk = sentenceChunk;
      }
      continue;
    }

    const combined = currentChunk
      ? `${currentChunk}\n\n${paragraph}`
      : overlapBuffer
        ? `${overlapBuffer}\n\n${paragraph}`
        : paragraph;

    if (estimateTokens(combined) > maxTokens && currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex: chunks.length,
        tokenEstimate: estimateTokens(currentChunk),
      });
      overlapBuffer = extractOverlap(currentChunk, overlap);
      currentChunk = overlapBuffer ? `${overlapBuffer}\n\n${paragraph}` : paragraph;
    } else {
      currentChunk = combined;
    }
  }

  // Flush remaining
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex: chunks.length,
      tokenEstimate: estimateTokens(currentChunk),
    });
  }

  return chunks;
}

function extractOverlap(text: string, overlapTokens: number): string {
  const sentences = splitIntoSentences(text);
  let overlap = '';

  // Take sentences from the end until we hit the overlap token count
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = sentences[i] + (overlap ? ' ' + overlap : '');
    if (estimateTokens(candidate) > overlapTokens) break;
    overlap = candidate;
  }

  return overlap;
}

export function chunkDocument(text: string, sourceType: string): Chunk[] {
  if (sourceType === 'workshop' || sourceType === 'markdown') {
    return chunkByMarkdownHeadings(text);
  } else {
    // Transcript/prose: paragraph-aware chunking with overlap
    return chunkByParagraphs(text, { maxTokens: 500, overlap: 50 });
  }
}
