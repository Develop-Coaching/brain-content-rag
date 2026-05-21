// Buffer adapter — preferred Mode A path because Greg Brain already references it.
// Buffer free covers LinkedIn + Instagram + Facebook + X with one OAuth.
// Docs: https://buffer.com/developers/api/updates

import type { PublishResult, QueuePost } from '../types.js';
import { formatCaption } from '../caption.js';

const PROFILE_ENV: Record<string, string> = {
  linkedin: 'BUFFER_LINKEDIN_PROFILE_ID',
  instagram: 'BUFFER_INSTAGRAM_PROFILE_ID',
  instagram_caption: 'BUFFER_INSTAGRAM_PROFILE_ID',
  facebook: 'BUFFER_FACEBOOK_PROFILE_ID',
  x: 'BUFFER_X_PROFILE_ID',
};

export function bufferConfigured(platform: string): boolean {
  if (!process.env.BUFFER_ACCESS_TOKEN) return false;
  const envKey = PROFILE_ENV[platform];
  return !!(envKey && process.env[envKey]);
}

export async function publishToBuffer(post: QueuePost): Promise<PublishResult> {
  const token = process.env.BUFFER_ACCESS_TOKEN!;
  const profileEnv = PROFILE_ENV[post.platform];
  const profileId = profileEnv ? process.env[profileEnv] : undefined;

  if (!profileId) {
    return {
      success: false,
      mode: 'buffer',
      error: `No Buffer profile id for platform ${post.platform}`,
    };
  }

  const caption = formatCaption(post.platform, post.draft_content);
  const params = new URLSearchParams();
  params.set('profile_ids[]', profileId);
  params.set('text', caption.body);

  // Buffer accepts media[link] for the image
  const imageUrl = pickImage(post);
  if (imageUrl) {
    params.set('media[link]', imageUrl);
    params.set('media[picture]', imageUrl);
    params.set('media[thumbnail]', imageUrl);
  }

  // If a scheduled time is in the future, hand it to Buffer; otherwise post now
  const sched = post.scheduled_time ? new Date(post.scheduled_time) : null;
  if (sched && sched.getTime() > Date.now() + 60_000) {
    params.set('scheduled_at', String(Math.floor(sched.getTime() / 1000)));
  } else {
    params.set('now', 'true');
  }

  const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: params,
  });

  const json: any = await res.json().catch(() => ({}));

  if (!res.ok || json?.success === false) {
    return {
      success: false,
      mode: 'buffer',
      error: `Buffer ${res.status}: ${json?.message || res.statusText}`,
    };
  }

  const update = json?.updates?.[0];
  return {
    success: true,
    mode: 'buffer',
    externalId: update?.id,
    externalUrl: update?.service_link || undefined,
  };
}

function pickImage(post: QueuePost): string | null {
  if (post.image_urls && post.image_urls.length) return post.image_urls[0];
  if (post.asset_url) return post.asset_url;
  return null;
}
