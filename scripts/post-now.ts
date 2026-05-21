// One-shot publisher: post to IG / FB / LinkedIn right now, no DB queue.
//
// Usage:
//   npx tsx scripts/post-now.ts --platforms ig,fb,linkedin --text "the post body"
//   npx tsx scripts/post-now.ts --platforms all --text "..." --image https://....jpg
//   npx tsx scripts/post-now.ts --platforms ig --text "..." --image ./local/path.jpg
//
// Flags:
//   --platforms   comma list: ig, fb, linkedin, all
//   --text        post body (required)
//   --image       public URL OR local file path (auto-uploaded to Supabase Storage)
//   --dry-run     print what would post without calling APIs
//
// Notes:
//   - Instagram requires an image. Without --image, IG is skipped.
//   - Captions are auto-formatted (per-platform char/hashtag limits) by caption.ts.

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { basename, extname } from 'path';
import { createClient } from '@supabase/supabase-js';

import type { QueuePost, Platform, PublishResult } from '../src/publisher/types.js';
import { publishToInstagram, publishToFacebook } from '../src/publisher/adapters/meta.js';
import { publishToLinkedIn } from '../src/publisher/adapters/linkedin.js';
import { publishToYouTube } from '../src/publisher/adapters/youtube.js';

interface Args {
  platforms: string[];
  text: string;
  image?: string;
  video?: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (flag: string) => argv.includes(flag);

  const platformsRaw = get('--platforms') ?? '';
  const text = get('--text') ?? '';
  const image = get('--image');
  const video = get('--video');
  const dryRun = has('--dry-run');

  if (!platformsRaw || !text) {
    console.error('Usage: post-now --platforms ig,fb,linkedin,yt --text "..." [--image url|path] [--video path] [--dry-run]');
    process.exit(1);
  }

  let platforms = platformsRaw.split(',').map((s) => s.trim().toLowerCase());
  if (platforms.includes('all')) platforms = ['ig', 'fb', 'linkedin', 'yt'];

  const valid = new Set(['ig', 'fb', 'linkedin', 'yt']);
  for (const p of platforms) {
    if (!valid.has(p)) {
      console.error(`Unknown platform: ${p} (valid: ig, fb, linkedin, yt, all)`);
      process.exit(1);
    }
  }

  return { platforms, text, image, video, dryRun };
}

async function resolveImageUrl(image: string | undefined): Promise<string | undefined> {
  if (!image) return undefined;
  if (/^https?:\/\//.test(image)) return image;

  if (!existsSync(image)) {
    throw new Error(`Image not found: ${image}`);
  }

  // Upload local file to Supabase Storage and return the public URL.
  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    throw new Error('Cannot upload local image — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  }
  const supa = createClient(supaUrl, supaKey);

  const bucket = process.env.PUBLISHER_IMAGE_BUCKET || 'publisher-images';
  // Bucket assumed pre-created (see README). Don't pre-check — saves one flaky API call.

  const ext = extname(image) || '.jpg';
  const key = `${Date.now()}-${basename(image).replace(/[^a-z0-9._-]/gi, '_')}${ext.startsWith('.') ? '' : '.'}`;
  const bytes = readFileSync(image);
  const ct = ext.toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';

  const up = await supa.storage.from(bucket).upload(key, bytes, { contentType: ct, upsert: false });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);

  const pub = supa.storage.from(bucket).getPublicUrl(up.data.path);
  return pub.data.publicUrl;
}

function buildPost(platform: Platform, text: string, imageUrl?: string): QueuePost {
  return {
    id: `manual-${Date.now()}`,
    calendar_id: null,
    platform,
    post_type: 'manual',
    draft_content: text,
    description: null,
    scheduled_date: null,
    scheduled_time: null,
    status: 'manual',
    publish_mode: 'auto',
    publish_target: null,
    image_urls: imageUrl ? [imageUrl] : null,
    asset_url: imageUrl ?? null,
    publish_attempts: 0,
    last_publish_error: null,
    published_url: null,
    weekly_batch_id: null,
    chloe_notes: null,
  };
}

async function run() {
  const args = parseArgs();
  const imageUrl = await resolveImageUrl(args.image);

  console.log('');
  console.log(`Platforms: ${args.platforms.join(', ')}`);
  console.log(`Image:     ${imageUrl ?? '(none)'}`);
  console.log(`Video:     ${args.video ?? '(none)'}`);
  console.log(`Text:      ${args.text.slice(0, 80)}${args.text.length > 80 ? '...' : ''}`);
  console.log('');

  if (args.dryRun) {
    console.log('Dry run — exiting without posting.');
    return;
  }

  const results: { platform: string; result: PublishResult }[] = [];

  for (const p of args.platforms) {
    if (p === 'ig') {
      if (!imageUrl) {
        results.push({
          platform: 'ig',
          result: { success: false, mode: 'meta_ig', error: 'Instagram needs an image — skipped' },
        });
        continue;
      }
      const post = buildPost('instagram', args.text, imageUrl);
      results.push({ platform: 'ig', result: await publishToInstagram(post) });
    } else if (p === 'fb') {
      const post = buildPost('facebook', args.text, imageUrl);
      results.push({ platform: 'fb', result: await publishToFacebook(post) });
    } else if (p === 'linkedin') {
      const post = buildPost('linkedin', args.text, imageUrl);
      results.push({ platform: 'linkedin', result: await publishToLinkedIn(post) });
    } else if (p === 'yt') {
      if (!args.video) {
        results.push({
          platform: 'yt',
          result: { success: false, mode: 'youtube', error: 'YouTube needs --video <path> — skipped' },
        });
        continue;
      }
      const post = buildPost('youtube', args.text, args.video);
      results.push({ platform: 'yt', result: await publishToYouTube(post) });
    }
  }

  console.log('Results:');
  console.log('');
  for (const { platform, result } of results) {
    const tag = result.success ? 'OK ' : 'ERR';
    console.log(`  [${tag}] ${platform.padEnd(8)} ${result.externalUrl ?? result.error ?? ''}`);
  }

  const failed = results.filter((r) => !r.result.success).length;
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
