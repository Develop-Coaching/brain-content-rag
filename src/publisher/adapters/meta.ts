// Meta Graph adapter — direct publish to Instagram + Facebook.
// IG single-image: POST /{ig-user-id}/media → POST /{ig-user-id}/media_publish
// IG carousel:    create child containers (is_carousel_item=true) → parent with media_type=CAROUSEL → publish
// IG reel:        POST /{ig-user-id}/media with media_type=REELS,video_url → poll status_code=FINISHED → publish
// FB flow:        POST /{page-id}/photos with published=true (or /feed for text-only)
// Docs:
//   https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//   https://developers.facebook.com/docs/instagram-api/guides/content-publishing/carousel-posts
//   https://developers.facebook.com/docs/instagram-api/guides/content-publishing/reels-posts

import type { PublishResult, QueuePost } from '../types.js';
import { formatCaption } from '../caption.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

function isVideoAsset(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|mov|m4v)(\?|$)/i.test(url);
}

async function fetchIgPermalink(mediaId: string, token: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${token}`);
    const json: any = await res.json();
    return json.permalink;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export function metaIgConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);
}

// Public entrypoint — routes to single / carousel / reel based on post shape.
// NOTE: the live greg_content_queue table has no asset_url/image_urls columns, so the
// hosted media URL (Supabase Storage public URL) is carried in `publish_target`. Meta's
// servers fetch that URL directly, so it MUST be a public https link, not a local path.
export async function publishToInstagram(post: QueuePost): Promise<PublishResult> {
  const images = post.image_urls ?? [];
  const hosted = post.asset_url || post.publish_target; // public media URL
  const isReel = post.post_type === 'reel' || isVideoAsset(post.asset_url) || isVideoAsset(hosted);

  if (isReel) {
    const videoUrl = post.asset_url || post.publish_target;
    if (!videoUrl) {
      return { success: false, mode: 'meta_ig', error: 'IG reel requires a hosted video URL (publish_target)' };
    }
    return publishInstagramReel(post, videoUrl);
  }

  if (images.length > 1) {
    return publishInstagramCarousel(post, images);
  }

  const imageUrl = images[0] || hosted;
  if (!imageUrl) {
    return { success: false, mode: 'meta_ig', error: 'Instagram requires an image_url — none on post' };
  }
  return publishInstagramSingle(post, imageUrl);
}

async function publishInstagramSingle(post: QueuePost, imageUrl: string): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN!;
  const igUserId = process.env.META_IG_USER_ID!;
  const caption = formatCaption('instagram', post.draft_content).body;

  const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
  });
  const createJson: any = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    return { success: false, mode: 'meta_ig', error: `IG single create failed: ${JSON.stringify(createJson)}` };
  }

  const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: createJson.id, access_token: token }),
  });
  const publishJson: any = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) {
    return { success: false, mode: 'meta_ig', error: `IG single publish failed: ${JSON.stringify(publishJson)}` };
  }

  return {
    success: true,
    mode: 'meta_ig',
    externalId: publishJson.id,
    externalUrl: await fetchIgPermalink(publishJson.id, token),
  };
}

// Poll a media container until it has finished processing, so we never publish
// before Instagram is ready (subcode 2207027). Returns ok on FINISHED.
async function waitForContainerReady(
  containerId: string,
  token: string,
  attempts = 15,
  delayMs = 3000
): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`);
    const json: any = await res.json();
    if (json.status_code === 'FINISHED') return { ok: true };
    if (json.status_code === 'ERROR' || json.status_code === 'EXPIRED') {
      return { ok: false, error: json.status || json.status_code };
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { ok: false, error: 'timed out waiting for container to finish processing' };
}

async function publishInstagramCarousel(post: QueuePost, images: string[]): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN!;
  const igUserId = process.env.META_IG_USER_ID!;
  const caption = formatCaption('instagram', post.draft_content).body;

  if (images.length < 2 || images.length > 10) {
    return { success: false, mode: 'meta_ig', error: `IG carousel needs 2-10 images, got ${images.length}` };
  }

  // Step 1: create a child container for each image
  const childIds: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const res = await fetch(`${GRAPH}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: images[i], is_carousel_item: true, access_token: token }),
    });
    const json: any = await res.json();
    if (!res.ok || !json.id) {
      return { success: false, mode: 'meta_ig', error: `IG carousel child ${i + 1} create failed: ${JSON.stringify(json)}` };
    }
    childIds.push(json.id);
  }

  // Step 2: create the carousel parent container
  const parentRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: token,
    }),
  });
  const parentJson: any = await parentRes.json();
  if (!parentRes.ok || !parentJson.id) {
    return { success: false, mode: 'meta_ig', error: `IG carousel parent create failed: ${JSON.stringify(parentJson)}` };
  }

  // Step 2.5: wait for the parent container to finish processing. Publishing a
  // multi-image carousel too early returns "media is not ready" (subcode 2207027),
  // which is more likely with several large images.
  const ready = await waitForContainerReady(parentJson.id, token);
  if (!ready.ok) {
    return { success: false, mode: 'meta_ig', error: `IG carousel not ready: ${ready.error}` };
  }

  // Step 3: publish the carousel
  const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: parentJson.id, access_token: token }),
  });
  const publishJson: any = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) {
    return { success: false, mode: 'meta_ig', error: `IG carousel publish failed: ${JSON.stringify(publishJson)}` };
  }

  return {
    success: true,
    mode: 'meta_ig',
    externalId: publishJson.id,
    externalUrl: await fetchIgPermalink(publishJson.id, token),
  };
}

async function publishInstagramReel(post: QueuePost, videoUrl: string): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN!;
  const igUserId = process.env.META_IG_USER_ID!;
  const caption = formatCaption('instagram', post.draft_content).body;

  // Step 1: create the reels container
  const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      share_to_feed: true,
      access_token: token,
    }),
  });
  const createJson: any = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    return { success: false, mode: 'meta_ig', error: `IG reel create failed: ${JSON.stringify(createJson)}` };
  }

  // Step 2: poll status_code until FINISHED (or ERROR). Reels can take 60-300s to process.
  const containerId = createJson.id;
  const deadline = Date.now() + 6 * 60 * 1000; // 6 min cap
  let status = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 7000));
    const sres = await fetch(`${GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`);
    const sjson: any = await sres.json();
    status = sjson.status_code || sjson.status || 'IN_PROGRESS';
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      return { success: false, mode: 'meta_ig', error: `IG reel processing failed: ${JSON.stringify(sjson)}` };
    }
  }
  if (status !== 'FINISHED') {
    return { success: false, mode: 'meta_ig', error: `IG reel processing timed out (last status: ${status})` };
  }

  // Step 3: publish the reel
  const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const publishJson: any = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) {
    return { success: false, mode: 'meta_ig', error: `IG reel publish failed: ${JSON.stringify(publishJson)}` };
  }

  return {
    success: true,
    mode: 'meta_ig',
    externalId: publishJson.id,
    externalUrl: await fetchIgPermalink(publishJson.id, token),
  };
}

// ---------------------------------------------------------------------------
// Facebook Page
// ---------------------------------------------------------------------------

export function metaFbConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_FB_PAGE_ID);
}

export async function publishToFacebook(post: QueuePost): Promise<PublishResult> {
  const token = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN!;
  const pageId = process.env.META_FB_PAGE_ID!;
  const images = post.image_urls ?? [];
  const message = formatCaption('facebook', post.draft_content).body;

  // 2+ images → native multi-photo feed post (upload each unpublished, attach to /feed).
  if (images.length > 1) {
    return publishFacebookMultiPhoto(post, images, message, pageId, token);
  }

  const imageUrl = images[0] || post.asset_url;

  // With image: /photos. Without: /feed.
  const endpoint = imageUrl ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
  const body: Record<string, unknown> = {
    access_token: token,
    published: true,
  };
  if (imageUrl) {
    body.url = imageUrl;
    body.caption = message;
  } else {
    body.message = message;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json: any = await res.json();
  if (!res.ok || !(json.id || json.post_id)) {
    return {
      success: false,
      mode: 'meta_fb',
      error: `FB publish failed: ${JSON.stringify(json)}`,
    };
  }

  const externalId = json.post_id || json.id;
  return {
    success: true,
    mode: 'meta_fb',
    externalId,
    externalUrl: `https://facebook.com/${externalId}`,
  };
}

// Multi-photo Facebook post: upload each photo unpublished, then create one feed
// post that attaches them all. Mirrors the IG carousel shape for FB.
// Docs: https://developers.facebook.com/docs/graph-api/reference/page/feed (attached_media)
async function publishFacebookMultiPhoto(
  post: QueuePost,
  images: string[],
  message: string,
  pageId: string,
  token: string,
): Promise<PublishResult> {
  // Step 1: upload each photo as unpublished, collect its media_fbid.
  const mediaFbids: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const res = await fetch(`${GRAPH}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: images[i], published: false, access_token: token }),
    });
    const json: any = await res.json();
    if (!res.ok || !json.id) {
      return { success: false, mode: 'meta_fb', error: `FB multi-photo upload ${i + 1} failed: ${JSON.stringify(json)}` };
    }
    mediaFbids.push(json.id);
  }

  // Step 2: create the feed post attaching all photos.
  // attached_media MUST be a real JSON array here — with Content-Type:
  // application/json the Graph API ignores bracket-indexed string keys like
  // "attached_media[0]", silently publishing a text-only post and leaving the
  // photos as orphaned unpublished uploads.
  const body: Record<string, unknown> = {
    access_token: token,
    published: true,
    message,
    attached_media: mediaFbids.map((id) => ({ media_fbid: id })),
  };

  const res = await fetch(`${GRAPH}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  if (!res.ok || !(json.id || json.post_id)) {
    return { success: false, mode: 'meta_fb', error: `FB multi-photo feed post failed: ${JSON.stringify(json)}` };
  }

  const externalId = json.post_id || json.id;
  return {
    success: true,
    mode: 'meta_fb',
    externalId,
    externalUrl: `https://facebook.com/${externalId}`,
  };
}
