// Meta Graph adapter — direct publish to Instagram + Facebook.
// IG flow: POST /{ig-user-id}/media → POST /{ig-user-id}/media_publish
// FB flow: POST /{page-id}/photos with published=true (or /feed for text-only)
// Docs:
//   https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//   https://developers.facebook.com/docs/pages-api/posts

import type { PublishResult, QueuePost } from '../types.js';
import { formatCaption } from '../caption.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

export function metaIgConfigured(): boolean {
  return !!(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);
}

export async function publishToInstagram(post: QueuePost): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN!;
  const igUserId = process.env.META_IG_USER_ID!;
  const imageUrl = post.image_urls?.[0] || post.asset_url;

  if (!imageUrl) {
    return {
      success: false,
      mode: 'meta_ig',
      error: 'Instagram requires an image_url — none on post',
    };
  }

  const caption = formatCaption('instagram', post.draft_content).body;

  // Step 1: create container
  const createRes = await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: token,
    }),
  });

  const createJson: any = await createRes.json();
  if (!createRes.ok || !createJson.id) {
    return {
      success: false,
      mode: 'meta_ig',
      error: `IG create container failed: ${JSON.stringify(createJson)}`,
    };
  }

  // Step 2: publish container
  const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: createJson.id,
      access_token: token,
    }),
  });

  const publishJson: any = await publishRes.json();
  if (!publishRes.ok || !publishJson.id) {
    return {
      success: false,
      mode: 'meta_ig',
      error: `IG publish failed: ${JSON.stringify(publishJson)}`,
    };
  }

  // Fetch permalink (best-effort)
  let permalink: string | undefined;
  try {
    const permRes = await fetch(
      `${GRAPH}/${publishJson.id}?fields=permalink&access_token=${token}`
    );
    const permJson: any = await permRes.json();
    permalink = permJson.permalink;
  } catch {
    // ignore
  }

  return {
    success: true,
    mode: 'meta_ig',
    externalId: publishJson.id,
    externalUrl: permalink,
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
  const imageUrl = post.image_urls?.[0] || post.asset_url;
  const message = formatCaption('facebook', post.draft_content).body;

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
