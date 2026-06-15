#!/usr/bin/env tsx
// Upload a single video file to the Develop Coaching YouTube channel.
//
//   npm run youtube -- <video> [options]
//
// Options:
//   --title "..."         Video title (default: first line of the caption)
//   --caption <file>      Caption/description file (default: caption.txt next to the video)
//   --description "..."   Inline description (overrides --caption)
//   --privacy <p>         public | unlisted | private  (default: public)
//   --dry                 Print what would be uploaded, don't call the API
//
// Vertical clips <=3min are auto-classified by YouTube as Shorts.
// Requires YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN in .env.

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { uploadVideo, youtubeConfigured, type YouTubePrivacy } from '../src/publisher/adapters/youtube.js';

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const videoPath = process.argv[2];
  if (!videoPath || videoPath.startsWith('--')) {
    console.error('Usage: npm run youtube -- <video> [--title "..."] [--caption <file>] [--privacy public|unlisted|private] [--dry]');
    process.exit(1);
  }
  if (!existsSync(videoPath)) {
    console.error(`Video not found: ${videoPath}`);
    process.exit(1);
  }
  if (!youtubeConfigured()) {
    console.error('YouTube not configured — set YOUTUBE_CLIENT_ID / _SECRET / _REFRESH_TOKEN in .env');
    process.exit(1);
  }

  // Resolve the description: inline --description, else --caption file, else caption.txt beside the video.
  let description = getFlag('description') ?? '';
  if (!description) {
    const captionFile = getFlag('caption') ?? join(dirname(videoPath), 'caption.txt');
    if (existsSync(captionFile)) {
      description = readFileSync(captionFile, 'utf8').trim();
    }
  }

  const lines = description.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = getFlag('title') ?? lines[0] ?? 'Develop Coaching';
  const tags = Array.from(description.matchAll(/#(\w+)/g)).map((m) => m[1]);
  const privacy = (getFlag('privacy') ?? 'public') as YouTubePrivacy;

  console.log('Video      :', videoPath);
  console.log('Title      :', title);
  console.log('Privacy    :', privacy);
  console.log('Tags       :', tags.join(', ') || '(none)');
  console.log('Description:', description ? description.slice(0, 120) + (description.length > 120 ? '…' : '') : '(none)');

  if (hasFlag('dry')) {
    console.log('\n--dry: not uploading.');
    return;
  }

  const result = await uploadVideo({ videoPath, title, description, tags, privacy });
  if (result.success) {
    console.log('\n✅ Uploaded:', result.externalUrl);
    console.log('   Shorts URL:', `https://youtube.com/shorts/${result.externalId}`);
  } else {
    console.error('\n❌ Failed:', result.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
