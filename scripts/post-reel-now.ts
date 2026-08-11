#!/usr/bin/env tsx
// post-reel-now.ts — upload a local reel to Supabase Storage (public) and publish it
// RIGHT NOW to Instagram (as a Reel) and/or Facebook (as a native Page video).
// No DB queue, no cron: it touches only this reel and posts immediately.
//
//   npx tsx scripts/post-reel-now.ts <video> --caption <file> --platforms ig,fb [--cover <jpg>] [--dry]
//
// ALWAYS pass --cover. Without it IG and FB each pick their own frame and it is routinely
// a bad one (mid-blink, looking down, face obscured). The IG cover is set at container
// creation and CANNOT be changed afterwards, so a missing cover means delete and repost.
//
// IG reuses the tested adapter (publishToInstagram → reel flow). FB fills the gap the
// shared adapter has (publishToFacebook is image/text only) by posting to /{page}/videos
// with file_url, which Meta fetches from the public Supabase URL.
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, META_ACCESS_TOKEN, META_IG_USER_ID,
// META_FB_PAGE_ID, and (for FB) META_PAGE_ACCESS_TOKEN in .env.

import 'dotenv/config';
import { readFileSync, existsSync, statSync } from 'fs';
import { basename } from 'path';
import { publishToInstagram } from '../src/publisher/adapters/meta.js';
import type { QueuePost } from '../src/publisher/types.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function uploadToSupabase(path: string, contentType = 'video/mp4'): Promise<string> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const bytes = readFileSync(path);
  const safe = basename(path).replace(/[^A-Za-z0-9._-]/g, '_');
  const objectKey = `ai-tools-workshop/${Date.now()}-${safe}`;
  console.log(`Uploading ${(bytes.length / 1e6).toFixed(1)} MB → reels/${objectKey} …`);
  const res = await fetch(`${url}/storage/v1/object/reels/${objectKey}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Supabase upload failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return `${url}/storage/v1/object/public/reels/${objectKey}`;
}

// IG reel publish with an explicit cover frame. The shared adapter has no cover_url
// parameter, so a reel posted through it gets whatever frame Instagram picks, which is
// usually a bad one. Cover CANNOT be changed after publishing, by API or in the app, so
// it has to be set here at container-create time or not at all.
async function postInstagramReelWithCover(
  videoUrl: string,
  caption: string,
  coverUrl: string,
): Promise<{ id: string; url: string }> {
  const token = process.env.META_ACCESS_TOKEN!;
  const igUserId = process.env.META_IG_USER_ID!;

  const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      cover_url: coverUrl,
      share_to_feed: true,
      access_token: token,
    }),
  });
  const createJson: any = await createRes.json();
  if (!createRes.ok || !createJson.id) throw new Error(`IG reel create failed: ${JSON.stringify(createJson)}`);

  const containerId = createJson.id;
  const deadline = Date.now() + 6 * 60 * 1000;
  let status = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 7000));
    const sres = await fetch(`${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`);
    const sjson: any = await sres.json();
    status = sjson.status_code || sjson.status || 'IN_PROGRESS';
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`IG reel processing failed: ${JSON.stringify(sjson)}`);
  }
  if (status !== 'FINISHED') throw new Error(`IG reel processing timed out (last status: ${status})`);

  const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const publishJson: any = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) throw new Error(`IG reel publish failed: ${JSON.stringify(publishJson)}`);

  const permaRes = await fetch(`${GRAPH}/${publishJson.id}?fields=permalink&access_token=${token}`);
  const permaJson: any = await permaRes.json();
  return { id: publishJson.id, url: permaJson.permalink ?? `https://www.instagram.com/reel/${publishJson.id}/` };
}

// FB, unlike IG, DOES allow the thumbnail to be changed after publishing.
async function setFacebookThumbnail(videoId: string, coverPath: string): Promise<void> {
  const token = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const form = new FormData();
  form.append('source', new Blob([readFileSync(coverPath)], { type: 'image/jpeg' }), basename(coverPath));
  form.append('is_preferred', 'true');
  form.append('access_token', token!);
  const res = await fetch(`${GRAPH}/${videoId}/thumbnails`, { method: 'POST', body: form });
  const json: any = await res.json();
  if (!res.ok || json.error) throw new Error(`FB thumbnail failed: ${JSON.stringify(json)}`);
}

async function postFacebookVideo(videoUrl: string, caption: string): Promise<{ id: string; url: string }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_FB_PAGE_ID;
  if (!token || !pageId) throw new Error('Missing META_PAGE_ACCESS_TOKEN / META_FB_PAGE_ID');
  const res = await fetch(`${GRAPH}/${pageId}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_url: videoUrl, description: caption, access_token: token }),
  });
  const json: any = await res.json();
  if (!res.ok || !json.id) throw new Error(`FB video publish failed: ${JSON.stringify(json)}`);
  return { id: json.id, url: `https://facebook.com/${json.id}` };
}

async function main() {
  const video = process.argv[2];
  if (!video || video.startsWith('--') || !existsSync(video)) {
    console.error('Usage: post-reel-now <video> --caption <file> --platforms ig,fb [--dry]');
    process.exit(1);
  }
  const capFile = flag('caption');
  const caption = capFile ? readFileSync(capFile, 'utf8').trim() : (flag('text') ?? '');
  if (!caption) { console.error('Need --caption <file> or --text'); process.exit(1); }
  const platforms = (flag('platforms') ?? 'ig,fb').split(',').map((s) => s.trim().toLowerCase());
  const cover = flag('cover');
  if (cover && !existsSync(cover)) { console.error(`Cover not found: ${cover}`); process.exit(1); }

  console.log(`Video     : ${video} (${(statSync(video).size / 1e6).toFixed(1)} MB)`);
  console.log(`Platforms : ${platforms.join(', ')}`);
  console.log(`Cover     : ${cover ?? 'none (platform picks a frame, usually badly)'}`);
  console.log(`Caption   : ${caption.slice(0, 80)}…`);
  console.log('');

  if (has('dry')) { console.log('--dry: not uploading or posting.'); return; }

  const videoUrl = await uploadToSupabase(video);
  console.log(`Public URL: ${videoUrl}\n`);

  let coverUrl: string | undefined;
  if (cover) {
    coverUrl = await uploadToSupabase(cover, 'image/jpeg');
    console.log(`Cover URL : ${coverUrl}\n`);
  }

  const results: { platform: string; ok: boolean; url?: string; error?: string }[] = [];

  if (platforms.includes('ig')) {
    console.log('Instagram: creating + publishing reel (60-300s processing)…');
    try {
      if (coverUrl) {
        const r = await postInstagramReelWithCover(videoUrl, caption, coverUrl);
        results.push({ platform: 'instagram', ok: true, url: r.url });
        console.log(`  ✅ ${r.url} (cover set)`);
      } else {
        const post = {
          id: `reel-${Date.now()}`, platform: 'instagram', post_type: 'reel',
          draft_content: caption, asset_url: videoUrl, publish_target: videoUrl, image_urls: null,
        } as unknown as QueuePost;
        const r = await publishToInstagram(post);
        results.push({ platform: 'instagram', ok: r.success, url: r.externalUrl, error: r.error });
        console.log(r.success ? `  ✅ ${r.externalUrl}` : `  ❌ ${r.error}`);
      }
    } catch (e: any) {
      results.push({ platform: 'instagram', ok: false, error: e.message });
      console.log(`  ❌ ${e.message}`);
    }
  }

  if (platforms.includes('fb')) {
    console.log('Facebook: posting native page video…');
    try {
      const { id, url } = await postFacebookVideo(videoUrl, caption);
      if (cover) {
        await setFacebookThumbnail(id, cover);
        console.log('  thumbnail set');
      }
      results.push({ platform: 'facebook', ok: true, url });
      console.log(`  ✅ ${url}`);
    } catch (e: any) {
      results.push({ platform: 'facebook', ok: false, error: e.message });
      console.log(`  ❌ ${e.message}`);
    }
  }

  console.log('\nResults:');
  for (const r of results) console.log(`  [${r.ok ? 'OK ' : 'ERR'}] ${r.platform.padEnd(10)} ${r.url ?? r.error ?? ''}`);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
