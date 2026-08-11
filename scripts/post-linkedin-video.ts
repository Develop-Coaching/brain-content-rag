#!/usr/bin/env tsx
// One-off: post a VIDEO + text share to LinkedIn (person or org URN).
// The shared adapter (src/publisher/adapters/linkedin.ts) only does images,
// so this implements the feedshare-video upload + UGC post flow.
//
//   npx tsx scripts/post-linkedin-video.ts <video> --caption <file> [--publish]
//
// Without --publish it registers + uploads + polls the asset and stops
// (no public post). With --publish it also creates the live UGC post.
//
// Requires LINKEDIN_ACCESS_TOKEN (w_member_social) + LINKEDIN_AUTHOR_URN in .env.

import 'dotenv/config';
import { readFileSync, existsSync, statSync } from 'fs';

const LI = 'https://api.linkedin.com/v2';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function registerUpload(token: string, owner: string) {
  const res = await fetch(`${LI}/assets?action=registerUpload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
        owner,
        serviceRelationships: [
          { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
        ],
      },
    }),
  });
  if (!res.ok) throw new Error(`registerUpload ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  const uploadUrl =
    j.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  return { uploadUrl, asset: j.value.asset as string };
}

async function putBytes(token: string, uploadUrl: string, path: string) {
  const bytes = readFileSync(path);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`asset PUT ${res.status}: ${await res.text()}`);
}

async function pollAsset(token: string, asset: string, tries = 20): Promise<string> {
  const id = asset.split(':').pop();
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${LI}/assets/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const j: any = await res.json();
      const statuses = j?.recipes?.map((r: any) => r.status) ?? [];
      const overall = j?.status;
      console.log(`  poll ${i + 1}: status=${overall} recipes=${JSON.stringify(statuses)}`);
      if (statuses.includes('AVAILABLE')) return 'AVAILABLE';
      // No recipe array at all but asset marked usable -> treat as ready.
      if (statuses.length === 0 && overall === 'ALLOWED') return 'ALLOWED';
      if (statuses.includes('PROCESSING_FAILED')) throw new Error('asset processing failed');
    } else {
      console.log(`  poll ${i + 1}: HTTP ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  return 'TIMEOUT';
}

async function createPost(token: string, author: string, asset: string, text: string) {
  const res = await fetch(`${LI}/ugcPosts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'VIDEO',
          media: [{ status: 'READY', media: asset, title: { text: 'AI Tools Workshop' } }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!res.ok) throw new Error(`ugcPost ${res.status}: ${await res.text()}`);
  const urn = res.headers.get('x-restli-id') || (await res.json().catch(() => ({}))).id;
  return urn as string;
}

async function main() {
  const video = process.argv[2];
  if (!video || video.startsWith('--') || !existsSync(video)) {
    console.error('Usage: post-linkedin-video <video> --caption <file> [--publish]');
    process.exit(1);
  }
  const capFile = flag('caption');
  const text = capFile ? readFileSync(capFile, 'utf8').trim() : (flag('text') ?? '');
  if (!text) { console.error('Need --caption <file> or --text'); process.exit(1); }

  const token = process.env.LINKEDIN_ACCESS_TOKEN!;
  const author = process.env.LINKEDIN_AUTHOR_URN!;
  if (!token || !author) { console.error('Missing LINKEDIN_ACCESS_TOKEN / _AUTHOR_URN'); process.exit(1); }

  console.log(`Video   : ${video} (${(statSync(video).size / 1e6).toFixed(1)} MB)`);
  console.log(`Author  : ${author}`);
  console.log(`Publish : ${has('publish')}`);
  console.log('');

  console.log('1/4 registerUpload...');
  const { uploadUrl, asset } = await registerUpload(token, author);
  console.log(`   asset: ${asset}`);
  console.log('2/4 uploading bytes...');
  await putBytes(token, uploadUrl, video);
  console.log('   uploaded.');
  console.log('3/4 polling asset processing...');
  const status = await pollAsset(token, asset);
  console.log(`   final asset status: ${status}`);

  if (!has('publish')) {
    console.log('\nStopping before publish (no --publish flag). Asset is uploaded and ready to post.');
    console.log(`ASSET=${asset}`);
    return;
  }

  console.log('4/4 creating public post...');
  const urn = await createPost(token, author, asset, text);
  console.log(`\n✅ Posted: https://www.linkedin.com/feed/update/${urn}/`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
