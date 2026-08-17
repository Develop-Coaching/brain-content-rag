#!/usr/bin/env tsx
// Enqueue the promo posts that carry a published LinkedIn article, so the
// every-5-min publish cron fires them automatically.
//
// The article itself is NOT published by this script. LinkedIn's API cannot
// create native articles, so the article goes out through the supervised
// browser session in the linkedin-article-post skill. This only queues the
// text posts that point at it once it is live.
//
// Reads <article-dir>/promo.md, which the linkedin-article skill writes:
//
//   ---
//   article_url: https://www.linkedin.com/pulse/...
//   promo_1_time: 2026-09-15T08:00:00.000Z
//   promo_2_time: 2026-09-18T08:00:00.000Z
//   ---
//
//   ## Promo 1
//   <caption>
//
//   ## Promo 2
//   <caption>
//
// NOTE: Chloe schedules through Social Post Pro, not this queue. Use this only
// when the promo posts are deliberately going through the greg-brain Publisher.
// The Social Post Pro equivalent is scripts/enqueue-article-promo.ts in
// Marketing/Post Creator Software.
//
// This queue is live: rows publish within ~5 minutes of their scheduled time.
// So a dry run is the default and inserting needs an explicit --live.
//
// Usage:
//   npx tsx scripts/enqueue-article-promo.ts --article-dir "<path>"
//   npx tsx scripts/enqueue-article-promo.ts --article-dir "<path>" --live

import 'dotenv/config';
import { readFileSync, existsSync, statSync } from 'fs';
import { basename, extname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = !process.argv.includes('--live');
const BUCKET = process.env.PUBLISHER_IMAGE_BUCKET || 'publisher-images';

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

interface Promo {
  key: string;
  scheduled: string;
  caption: string;
}

function parsePromoFile(fp: string): { articleUrl: string; promos: Promo[] } {
  const raw = readFileSync(fp, 'utf8');
  if (!raw.startsWith('---')) throw new Error(`${fp} has no front matter`);
  const [, front, body] = raw.split('---', 3);

  const meta: Record<string, string> = {};
  for (const line of front.trim().split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const articleUrl = meta.article_url || '';
  if (!articleUrl || articleUrl.startsWith('<')) {
    throw new Error('promo.md needs a real article_url. Publish the article first, then paste its URL.');
  }

  // Split the body on '## Promo N' headings.
  const promos: Promo[] = [];
  const sections = body.split(/^##\s+/m).slice(1);
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = section.slice(0, newline).trim();
    const caption = section.slice(newline + 1).trim();
    const n = heading.match(/(\d+)/)?.[1];
    if (!n) continue;
    const scheduled = meta[`promo_${n}_time`];
    if (!scheduled) throw new Error(`No promo_${n}_time in the front matter for "${heading}"`);
    if (!caption) throw new Error(`"${heading}" has no caption`);
    promos.push({ key: `promo-${n}`, scheduled, caption });
  }
  if (!promos.length) throw new Error('No "## Promo N" sections found in promo.md');

  return { articleUrl, promos };
}

function ctFor(fp: string): string {
  return extname(fp).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

async function uploadOnce(
  supa: ReturnType<typeof createClient>,
  fp: string,
  key: string,
): Promise<string> {
  if (!existsSync(fp)) throw new Error(`Asset not found: ${fp}`);
  const bytes = readFileSync(fp);
  const size = statSync(fp).size;
  const storageKey = `${key}/${Date.now()}-${basename(fp).replace(/[^a-z0-9._-]/gi, '_')}`;
  console.log(`    uploading ${basename(fp)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  const up = await supa.storage.from(BUCKET).upload(storageKey, bytes, { contentType: ctFor(fp), upsert: false });
  if (up.error) throw new Error(`upload failed for ${fp}: ${up.error.message}`);
  return supa.storage.from(BUCKET).getPublicUrl(up.data.path).data.publicUrl;
}

async function main() {
  const articleDir = argValue('--article-dir');
  if (!articleDir) throw new Error('Pass --article-dir "<path to the month folder>"');

  const promoFile = join(articleDir, 'promo.md');
  if (!existsSync(promoFile)) throw new Error(`No promo.md in ${articleDir}`);
  const cover = join(articleDir, 'images', 'cover.png');
  if (!existsSync(cover)) throw new Error(`No cover image at ${cover}`);

  const { articleUrl, promos } = parsePromoFile(promoFile);

  // Greg's LinkedIn rule: links live in the first comment, never the post body,
  // because body links carry negative algorithm weight. The publisher cannot
  // post comments, so the link has to be added by hand after each post lands.
  for (const p of promos) {
    if (/https?:\/\//.test(p.caption)) {
      console.error(
        `\nREFUSING: ${p.key} has a link in the post body. On LinkedIn the link goes in ` +
        `the first comment. Remove it from the caption, then post the article URL as a ` +
        `comment once the post is live.`,
      );
      process.exit(1);
    }
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN' : 'LIVE'}: article promo posts -> greg_content_queue`);
  console.log(`Article:  ${articleUrl}`);
  console.log(`Cover:    ${cover}`);
  console.log(`Bucket:   ${BUCKET}\n`);

  for (const p of promos) {
    console.log(`${p.key} -> ${p.scheduled}`);
    console.log(`   ${p.caption.split('\n')[0].slice(0, 70)}...`);
    console.log(`   ${p.caption.split(/\s+/).length} words\n`);
  }

  console.log('After each promo post goes live, add this as the FIRST COMMENT:');
  console.log(`   ${articleUrl}\n`);

  if (DRY_RUN) {
    console.log('Dry run. Nothing uploaded, nothing inserted. Re-run with --live to queue.');
    return;
  }

  const supaUrl = process.env.SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  const supa = createClient(supaUrl, supaKey);

  const coverUrl = await uploadOnce(supa, cover, 'article-promo');

  const rows = promos.map((p) => ({
    calendar_id: null,
    platform: 'linkedin',
    post_type: 'hook_post',
    draft_content: p.caption,
    description: `Promo for the LinkedIn article: ${articleUrl}`,
    scheduled_date: p.scheduled.slice(0, 10),
    scheduled_time: p.scheduled,
    status: 'scheduled',
    publish_mode: 'auto',
    publish_target: coverUrl,
    image_urls: [coverUrl],
    chloe_notes: `Enqueued by enqueue-article-promo.ts. Add ${articleUrl} as the first comment once live.`,
  }));

  console.log(`\nInserting ${rows.length} rows into greg_content_queue...`);
  const { data, error } = await supa.from('greg_content_queue').insert(rows).select('id, platform, scheduled_time');
  if (error) { console.error('Insert failed:', error); process.exit(1); }
  for (const r of data ?? []) console.log(`  ${(r as any).id}  ${(r as any).platform}  ${(r as any).scheduled_time}`);
}

main().catch((err) => { console.error(err.message ?? err); process.exit(1); });
