// Image generation for Greg Brain monthly content
// Wires together multiple styles:
//   - whiteboard_carousel  → Python script (Gemini 3 Pro + whiteboard refs)
//   - whiteboard_single    → Python script (Gemini 3 Pro + whiteboard refs)
//   - cartoon_greg         → Gemini Flash + cartoon Greg refs
//   - realistic_greg       → Gemini Flash + photo Greg refs (expression-matched)
//   - quote_card           → Gemini Flash, text-only on DC brand gradient
//   - stat_blast           → Gemini Flash, big-number design on brand bg
// Images saved to: Marketing/Post Creator Software/public/generated/[month]/[post-id]/

import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const execFileAsync = promisify(execFile);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Public bucket the app already uses for uploaded post media (see
// app/api/posts/[id]/upload/route.ts). Reused here so generated images live at
// the same place.
const ASSET_BUCKET = 'post-assets';

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'image/png';
  }
}

// Upload each locally-generated image to Supabase Storage and return its public
// https URL. Meta (IG carousel + FB multi-photo) and every other adapter fetch
// media by public URL, so image_urls MUST hold real https links — a relative
// path like /generated/... is never reachable by their servers. Idempotent per
// key (upsert), and the local absolute paths are kept separately in image_paths.
async function uploadImagesToStorage(
  localPaths: string[],
  monthKey: string,
  postId: string,
): Promise<string[]> {
  // Ensure the bucket exists; ignore the "already exists" error.
  await supabase.storage.createBucket(ASSET_BUCKET, { public: true }).catch(() => {});

  const urls: string[] = [];
  for (const localPath of localPaths) {
    const bytes = fs.readFileSync(localPath);
    const key = `generated/${monthKey}/${postId}/${path.basename(localPath)}`;
    const { error } = await supabase.storage
      .from(ASSET_BUCKET)
      .upload(key, bytes, { contentType: contentTypeFor(localPath), upsert: true });
    if (error) {
      throw new Error(`Storage upload failed for ${path.basename(localPath)}: ${error.message}`);
    }
    const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(key);
    urls.push(data.publicUrl);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// From src/agent/ → src/ → greg-brain/ → Brain Content Rag/ → Marketing/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const WHITEBOARD_CAROUSEL_SCRIPT = path.join(
  PROJECT_ROOT, 'Image Generator Whiteboard', '.claude', 'skills',
  'whiteboard-carousel', 'generate.py'
);

const WHITEBOARD_SINGLE_SCRIPT = path.join(
  PROJECT_ROOT, 'Image Generator Whiteboard', '.claude', 'skills',
  'whiteboard-single', 'generate.py'
);

const IMAGE_OUTPUT_ROOT = path.join(
  PROJECT_ROOT, 'Post Creator Software', 'public', 'generated'
);

const CHARACTERS_DIR = path.join(PROJECT_ROOT, 'brand-assets', 'characters');

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

const BRAND = {
  navy: '#1a1a2e',
  orange: '#ff6b35',
  white: '#ffffff',
  font: 'bold sans-serif (Inter or similar)',
};

// ---------------------------------------------------------------------------
// Gemini API config
// ---------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-2.0-flash-preview-image-generation';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

let _cachedApiKey: string | null = null;

function loadGeminiApiKey(): string {
  if (_cachedApiKey) return _cachedApiKey;
  const envKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (envKey) { _cachedApiKey = envKey; return envKey; }

  const candidate = path.join(PROJECT_ROOT, 'Post Creator Software', '.env.local');
  if (fs.existsSync(candidate)) {
    for (const line of fs.readFileSync(candidate, 'utf-8').split('\n')) {
      const match = line.match(/^\s*(GOOGLE_GENERATIVE_AI_API_KEY|GEMINI_API_KEY)\s*=\s*(.+)/);
      if (match) {
        const key = match[2].trim().replace(/^["']|["']$/g, '');
        _cachedApiKey = key;
        return key;
      }
    }
  }
  throw new Error('No Gemini API key found.');
}

// ---------------------------------------------------------------------------
// Character reference loading
// ---------------------------------------------------------------------------

interface ReferenceImage {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

const _referenceCache = new Map<string, ReferenceImage[]>();

function loadReferenceImages(relativePath: string, maxImages = 3): ReferenceImage[] {
  if (_referenceCache.has(relativePath)) {
    return _referenceCache.get(relativePath)!;
  }

  const fullPath = path.join(CHARACTERS_DIR, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`  Reference folder not found: ${relativePath}`);
    _referenceCache.set(relativePath, []);
    return [];
  }

  const files = fs.readdirSync(fullPath)
    .filter(f => /\.(png|jpe?g)$/i.test(f))
    .filter(f => !f.startsWith('.'))
    .sort()
    .slice(0, maxImages);

  const refs: ReferenceImage[] = files.map(f => ({
    buffer: fs.readFileSync(path.join(fullPath, f)),
    mimeType: f.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
    filename: f,
  }));

  _referenceCache.set(relativePath, refs);
  return refs;
}

function loadSpecificReference(relativePath: string, filename: string): ReferenceImage | null {
  const fullPath = path.join(CHARACTERS_DIR, relativePath, filename);
  if (!fs.existsSync(fullPath)) return null;
  return {
    buffer: fs.readFileSync(fullPath),
    mimeType: filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
    filename,
  };
}

// Expression-to-engagement mapping for realistic Greg
// Picks the best expression from Normal Image/ folder based on post mood
const EXPRESSION_MAP: Record<string, string> = {
  contrarian_hook: 'facing forward one hand thumbs down mad face.png',
  open_question:   'Facing forward hand on chin.png',
  poll:            'Facing forward confused.png',
  comment_to_get:  'Facing Left hand on chin smiling.png',
  tag_prompt:      'Facing sideways pointing sideways.png',
  pin_comment:     'Hand Covering mouth.png',
  soft_cta:        'facing forward straight face.png',
};

function pickRealisticGregReference(engagementType: string | null): ReferenceImage | null {
  const filename = (engagementType && EXPRESSION_MAP[engagementType])
    || EXPRESSION_MAP.soft_cta;
  return loadSpecificReference('greg/Normal Image', filename);
}

// ---------------------------------------------------------------------------
// Gemini REST call (supports optional reference images)
// ---------------------------------------------------------------------------

async function callGeminiImage(
  prompt: string,
  aspectRatio: string = '1:1',
  references: ReferenceImage[] = []
): Promise<Buffer> {
  const apiKey = loadGeminiApiKey();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  for (const ref of references) {
    parts.push({
      inline_data: {
        mime_type: ref.mimeType,
        data: ref.buffer.toString('base64'),
      },
    });
  }
  parts.push({ text: prompt });

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
          console.log(`  Gemini ${response.status}, retrying in ${4 * (attempt + 1)}s...`);
          await sleep(4000 * (attempt + 1));
          continue;
        }
        throw new Error(`Gemini API ${response.status}: ${errText.slice(0, 500)}`);
      }

      const payload = await response.json();
      const respParts = payload?.candidates?.[0]?.content?.parts || [];
      for (const part of respParts) {
        const inline = part.inline_data || part.inlineData;
        if (inline?.data) return Buffer.from(inline.data, 'base64');
      }
      throw new Error('No image in Gemini response');
    } catch (err) {
      lastError = err as Error;
      if (attempt < 2) { await sleep(4000 * (attempt + 1)); continue; }
    }
  }
  throw lastError || new Error('Gemini image generation failed');
}

// ---------------------------------------------------------------------------
// Style: Whiteboard (Python subprocess — Gemini 3 Pro)
// ---------------------------------------------------------------------------

async function generateWhiteboardCarousel(
  topic: string, slides: number, outputDir: string
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`  Running whiteboard-carousel: ${slides} slides...`);
  const { stdout, stderr } = await execFileAsync('python3', [
    WHITEBOARD_CAROUSEL_SCRIPT,
    '--topic', topic,
    '--slides', String(slides),
    '--audience', 'construction / trades business owners',
    '--output-dir', outputDir,
  ], { timeout: 600_000 });
  if (stderr) console.log(`  Whiteboard stderr: ${stderr.trim()}`);
  if (stdout) console.log(`  ${stdout.trim()}`);
  return fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.png')).sort()
    .map(f => path.join(outputDir, f));
}

async function generateWhiteboardSingle(
  prompt: string, outputDir: string
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`  Running whiteboard-single...`);
  const { stdout, stderr } = await execFileAsync('python3', [
    WHITEBOARD_SINGLE_SCRIPT,
    '--prompt', prompt,
    '--output-dir', outputDir,
  ], { timeout: 180_000 });
  if (stderr) console.log(`  Whiteboard stderr: ${stderr.trim()}`);
  if (stdout) console.log(`  ${stdout.trim()}`);
  return fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(outputDir, f));
}

// ---------------------------------------------------------------------------
// Style: Cartoon Greg (Gemini Flash + cartoon refs)
// ---------------------------------------------------------------------------

async function generateCartoonGreg(
  graphicPrompt: string, aspectRatio: string, outputDir: string
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  const refs = loadReferenceImages('greg/Cartoon', 3);
  if (refs.length === 0) {
    throw new Error('No cartoon Greg references found in brand-assets/characters/greg/Cartoon/');
  }

  const prompt = `The reference images show GREG — an illustrated cartoon character (male, brown hair and beard, blue eyes, wearing a pink polo shirt). Generate a new illustration of GREG in the SAME cartoon art style, matching his facial features, hair, beard, and clothing consistently.

Scene: ${graphicPrompt}

Style: polished digital cartoon/illustration, clean linework, vibrant colours with subtle shading, friendly and approachable. Same cartoon style as the reference images. Keep Greg clearly recognisable — same face, same hair, same beard. Clean background (solid colour or simple scene) that complements the Develop Coaching brand. Brand accent colours where appropriate: navy ${BRAND.navy}, orange ${BRAND.orange}.`;

  console.log(`  Generating cartoon Greg (${aspectRatio})...`);
  const imgBuffer = await callGeminiImage(prompt, aspectRatio, refs);
  const outPath = path.join(outputDir, 'image.png');
  fs.writeFileSync(outPath, imgBuffer);
  fs.writeFileSync(path.join(outputDir, 'prompt.json'), JSON.stringify({
    style: 'cartoon_greg', model: GEMINI_MODEL, aspectRatio,
    references: refs.map(r => r.filename), fullPrompt: prompt,
  }, null, 2));
  console.log(`  -> ${outPath}`);
  return [outPath];
}

// ---------------------------------------------------------------------------
// Style: Realistic Greg (Gemini Flash + photo refs, expression-matched)
// ---------------------------------------------------------------------------

async function generateRealisticGreg(
  graphicPrompt: string,
  engagementType: string | null,
  aspectRatio: string,
  outputDir: string
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  const gregRef = pickRealisticGregReference(engagementType);
  if (!gregRef) {
    throw new Error('No realistic Greg reference found in brand-assets/characters/greg/Normal Image/');
  }

  const expressionNote = engagementType
    ? ` Keep the expression and pose from the reference (${engagementType} mood).`
    : '';

  const prompt = `The reference image shows GREG — a real person (male, brown hair, light beard, wearing a black t-shirt). Generate a photorealistic social media graphic featuring GREG, keeping his face, hair, and physical features EXACTLY as shown in the reference.${expressionNote}

Scene/context: ${graphicPrompt}

Style: high-quality photograph aesthetic, natural lighting, editorial feel. Place Greg in a context that fits the scene. This is for Develop Coaching (construction business coaching brand) — background should feel on-brand (modern office, construction site, studio with DC colours). Subtle brand accents in navy ${BRAND.navy} or orange ${BRAND.orange} where appropriate. NO TEXT OVERLAY on the image itself — this is a clean photo, text will be added separately if needed. Ensure Greg is clearly recognisable as the person in the reference.`;

  console.log(`  Generating realistic Greg (${aspectRatio}, expression: ${gregRef.filename})...`);
  const imgBuffer = await callGeminiImage(prompt, aspectRatio, [gregRef]);
  const outPath = path.join(outputDir, 'image.png');
  fs.writeFileSync(outPath, imgBuffer);
  fs.writeFileSync(path.join(outputDir, 'prompt.json'), JSON.stringify({
    style: 'realistic_greg', model: GEMINI_MODEL, aspectRatio,
    reference: gregRef.filename, engagementType, fullPrompt: prompt,
  }, null, 2));
  console.log(`  -> ${outPath}`);
  return [outPath];
}

// ---------------------------------------------------------------------------
// Style: Quote card (bold text on DC brand gradient, no character)
// ---------------------------------------------------------------------------

async function generateQuoteCard(
  quoteText: string, aspectRatio: string, outputDir: string
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const prompt = `Create a bold, modern quote card for Develop Coaching (construction business coaching). Design spec:

- Background: rich gradient from navy ${BRAND.navy} to a slightly lighter navy, OR solid navy with a subtle orange ${BRAND.orange} accent shape (diagonal bar, corner triangle, or circle)
- Main text: the quote below, in large bold sans-serif (Inter or similar), white colour, set in hand-lettered-style punchy typography. Line breaks where natural for punch.
- Small orange accent underline or bar beneath the key word(s)
- Optional small "DEVELOP COACHING" wordmark or "@developcoaching" tag in the bottom corner in white, small, subtle
- Clean, minimalist, high-contrast, scroll-stopping
- No character, no photo — text only design

QUOTE TO TYPESET:
"${quoteText}"

Output: ${aspectRatio} aspect ratio, professional social media quote card, ready to post.`;

  console.log(`  Generating quote card (${aspectRatio})...`);
  const imgBuffer = await callGeminiImage(prompt, aspectRatio, []);
  const outPath = path.join(outputDir, 'image.png');
  fs.writeFileSync(outPath, imgBuffer);
  fs.writeFileSync(path.join(outputDir, 'prompt.json'), JSON.stringify({
    style: 'quote_card', model: GEMINI_MODEL, aspectRatio, quoteText, fullPrompt: prompt,
  }, null, 2));
  console.log(`  -> ${outPath}`);
  return [outPath];
}

// ---------------------------------------------------------------------------
// Style: Stat blast (big number + supporting text)
// ---------------------------------------------------------------------------

async function generateStatBlast(
  graphicPrompt: string, aspectRatio: string, outputDir: string
): Promise<string[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const prompt = `Create a bold stat/data-driven social media graphic for Develop Coaching (construction business coaching). Design spec:

- Background: solid navy ${BRAND.navy} or navy with a subtle texture/gradient
- ONE massive central number or percentage (stat) in huge bold sans-serif, orange ${BRAND.orange} or white
- Short punchy supporting headline directly below the stat, white colour, bold but smaller
- Optional subheadline one more line, smaller still, in a lighter grey-white
- Clean geometric elements: a thin orange underline, a small orange accent shape, or a bracket
- "DEVELOP COACHING" small wordmark at the bottom
- High-contrast, scroll-stopping, data-journalism aesthetic
- No character, no photo — just typography and the stat

CONTENT TO TYPESET (extract the stat/number from this):
${graphicPrompt}

Output: ${aspectRatio} aspect ratio, professional stat graphic, ready to post.`;

  console.log(`  Generating stat blast (${aspectRatio})...`);
  const imgBuffer = await callGeminiImage(prompt, aspectRatio, []);
  const outPath = path.join(outputDir, 'image.png');
  fs.writeFileSync(outPath, imgBuffer);
  fs.writeFileSync(path.join(outputDir, 'prompt.json'), JSON.stringify({
    style: 'stat_blast', model: GEMINI_MODEL, aspectRatio, graphicPrompt, fullPrompt: prompt,
  }, null, 2));
  console.log(`  -> ${outPath}`);
  return [outPath];
}

// ---------------------------------------------------------------------------
// Style rotation: decide which style to use per post
// ---------------------------------------------------------------------------

type ImageStyle =
  | 'whiteboard_carousel'
  | 'whiteboard_single'
  | 'cartoon_greg'
  | 'realistic_greg'
  | 'quote_card'
  | 'stat_blast'
  | 'skip';

interface StyleDecision {
  style: ImageStyle;
  aspectRatio: string;
  slides?: number;
}

// Deterministic rotation per-platform. postIndex = 0-based index of this
// platform's post within the month (Week 1's IG post = 0, Week 2's = 1, etc.)
const IG_POST_ROTATION: ImageStyle[] = [
  'whiteboard_single',
  'cartoon_greg',
  'realistic_greg',
  'quote_card',
];

const LI_ARTICLE_ROTATION: ImageStyle[] = [
  'realistic_greg',
  'whiteboard_single',
  'quote_card',
  'stat_blast',
];

const LI_POST_ROTATION: ImageStyle[] = [
  'cartoon_greg',
  'quote_card',
  'realistic_greg',
  'stat_blast',
];

function decideStyle(platform: string, postIndex: number): StyleDecision {
  switch (platform) {
    case 'carousel':
      return { style: 'whiteboard_carousel', aspectRatio: '1:1', slides: 6 };

    case 'instagram_post': {
      const style = IG_POST_ROTATION[postIndex % IG_POST_ROTATION.length];
      return { style, aspectRatio: '1:1' };
    }

    case 'linkedin_article': {
      const style = LI_ARTICLE_ROTATION[postIndex % LI_ARTICLE_ROTATION.length];
      return { style, aspectRatio: '16:9' };
    }

    case 'linkedin_post': {
      const style = LI_POST_ROTATION[postIndex % LI_POST_ROTATION.length];
      return { style, aspectRatio: '1:1' };
    }

    // Reel thumbnails come from the actual filmed video, not AI
    case 'instagram_reel':
    case 'x':
    case 'email':
      return { style: 'skip', aspectRatio: '1:1' };

    default:
      return { style: 'quote_card', aspectRatio: '1:1' };
  }
}

// ---------------------------------------------------------------------------
// Dispatch: generate images for a single post
// ---------------------------------------------------------------------------

interface PostRecord {
  id: string;
  platform: string;
  post_type: string;
  graphic_prompt: string | null;
  draft_content: string;
  description: string | null;
  engagement_type: string | null;
  image_urls: string[] | null;
  image_paths: string[] | null;
}

async function generateImagesForPost(
  post: PostRecord, monthKey: string, postIndex: number
): Promise<{ paths: string[]; style: ImageStyle } | null> {
  const { style, aspectRatio, slides } = decideStyle(post.platform, postIndex);

  if (style === 'skip') {
    console.log(`  [${post.platform}] Skipping — no image needed`);
    return null;
  }

  // Most styles need a graphic_prompt; carousel and quote_card can derive from content
  const needsPrompt = style !== 'whiteboard_carousel' && style !== 'quote_card';
  if (needsPrompt && !post.graphic_prompt) {
    console.log(`  [${post.platform}] No graphic_prompt for style ${style}, skipping`);
    return null;
  }

  const outputDir = path.join(IMAGE_OUTPUT_ROOT, monthKey, post.id);
  let paths: string[];

  switch (style) {
    case 'whiteboard_carousel': {
      const topic = post.description || post.draft_content.slice(0, 100);
      paths = await generateWhiteboardCarousel(topic, slides || 6, outputDir);
      break;
    }
    case 'whiteboard_single': {
      const prompt = post.graphic_prompt || post.description || 'Construction business tip';
      paths = await generateWhiteboardSingle(prompt, outputDir);
      break;
    }
    case 'cartoon_greg':
      paths = await generateCartoonGreg(post.graphic_prompt!, aspectRatio, outputDir);
      break;
    case 'realistic_greg':
      paths = await generateRealisticGreg(
        post.graphic_prompt!, post.engagement_type, aspectRatio, outputDir
      );
      break;
    case 'quote_card': {
      const quote = post.description || post.draft_content.split('\n').find(l => l.trim().length > 20) || post.draft_content.slice(0, 120);
      paths = await generateQuoteCard(quote, aspectRatio, outputDir);
      break;
    }
    case 'stat_blast':
      paths = await generateStatBlast(post.graphic_prompt!, aspectRatio, outputDir);
      break;
    default:
      return null;
  }

  return { paths, style };
}

// ---------------------------------------------------------------------------
// Main: generate images for all posts in a calendar
// ---------------------------------------------------------------------------

export interface ImageGenerationResult {
  totalPosts: number;
  imagesGenerated: number;
  skipped: number;
  failed: number;
  failures: Array<{ postId: string; platform: string; error: string }>;
  byStyle: Record<string, number>;
}

export async function generateImagesForCalendar(
  calendarId: string, monthKey: string
): Promise<ImageGenerationResult> {
  console.log(`\n=== Image Generation: ${monthKey} ===\n`);

  const { data: posts, error } = await supabase
    .from('greg_content_queue')
    .select('id, platform, post_type, graphic_prompt, draft_content, description, engagement_type, image_urls, image_paths')
    .eq('calendar_id', calendarId)
    .order('scheduled_date');

  if (error) throw new Error(`Failed to fetch posts: ${error.message}`);
  if (!posts || posts.length === 0) {
    return { totalPosts: 0, imagesGenerated: 0, skipped: 0, failed: 0, failures: [], byStyle: {} };
  }

  const result: ImageGenerationResult = {
    totalPosts: posts.length,
    imagesGenerated: 0, skipped: 0, failed: 0,
    failures: [], byStyle: {},
  };

  // Per-platform counter for deterministic rotation
  const platformCounters: Record<string, number> = {};

  for (const post of posts as PostRecord[]) {
    // Idempotent: skip posts that already have images
    if (post.image_paths && post.image_paths.length > 0) {
      console.log(`[${post.platform}] Already has images, skipping (idempotent)`);
      result.skipped++;
      continue;
    }

    const postIndex = platformCounters[post.platform] || 0;
    platformCounters[post.platform] = postIndex + 1;

    console.log(`\n[${post.platform}/${post.post_type}] Post ${post.id.slice(0, 8)} (#${postIndex + 1})...`);

    try {
      const imageResult = await generateImagesForPost(post, monthKey, postIndex);
      if (!imageResult) { result.skipped++; continue; }

      // Upload to Storage so image_urls holds public https URLs the publisher
      // adapters can actually fetch (relative /generated/... paths never worked
      // for Meta/IG carousels). Local paths stay in image_paths for idempotency.
      const publicUrls = await uploadImagesToStorage(imageResult.paths, monthKey, post.id);

      const { error: updateError } = await supabase
        .from('greg_content_queue')
        .update({
          image_paths: imageResult.paths,
          image_urls: publicUrls,
          image_style: imageResult.style,
        })
        .eq('id', post.id);

      if (updateError) {
        console.error(`  Failed to update DB: ${updateError.message}`);
        result.failed++;
        result.failures.push({ postId: post.id, platform: post.platform, error: `DB update failed: ${updateError.message}` });
      } else {
        result.imagesGenerated++;
        result.byStyle[imageResult.style] = (result.byStyle[imageResult.style] || 0) + 1;
        console.log(`  Stored ${imageResult.paths.length} image(s) [${imageResult.style}]`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${errorMsg}`);
      result.failed++;
      result.failures.push({ postId: post.id, platform: post.platform, error: errorMsg });
    }
  }

  console.log(`\n=== Image Generation Complete ===`);
  console.log(`  Generated: ${result.imagesGenerated}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  By style:`, result.byStyle);

  return result;
}

export async function generateImagesForMonth(monthKey: string): Promise<ImageGenerationResult> {
  const { data: calendar, error } = await supabase
    .from('greg_monthly_calendars')
    .select('id')
    .eq('month', `${monthKey}-01`)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !calendar) {
    throw new Error(`No calendar found for ${monthKey}. Run monthly planning first.`);
  }
  return generateImagesForCalendar(calendar.id, monthKey);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
