// X (Twitter) adapter — post text via API v2, optional single image via v1.1 media upload.
// Auth: OAuth 1.0a user context (HMAC-SHA1), signed with Node's crypto — no extra deps.
// Docs: https://docs.x.com/x-api/posts/creation-of-a-post
//       https://docs.x.com/x-api/media/media-upload (v1.1 simple upload)

import { createHmac, randomBytes } from 'node:crypto';
import type { PublishResult, QueuePost } from '../types.js';
import { formatCaption } from '../caption.js';

const TWEET_URL = 'https://api.twitter.com/2/tweets';
const MEDIA_URL = 'https://upload.twitter.com/1.1/media/upload.json';

export function xConfigured(): boolean {
  return !!(
    process.env.X_API_KEY &&
    process.env.X_API_SECRET &&
    process.env.X_ACCESS_TOKEN &&
    process.env.X_ACCESS_TOKEN_SECRET
  );
}

export async function publishToX(post: QueuePost): Promise<PublishResult> {
  const text = formatCaption('x', post.draft_content).body;
  const imageUrl = post.image_urls?.[0] || post.asset_url;

  let mediaId: string | null = null;
  if (imageUrl) {
    try {
      mediaId = await uploadMedia(imageUrl);
    } catch (err) {
      // Soft-fail: a text-only tweet is better than no tweet.
      console.warn(`X media upload failed, posting text-only: ${err}`);
    }
  }

  const body: Record<string, unknown> = { text };
  if (mediaId) body.media = { media_ids: [mediaId] };

  const res = await fetch(TWEET_URL, {
    method: 'POST',
    headers: {
      Authorization: oauthHeader('POST', TWEET_URL, {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    return {
      success: false,
      mode: 'x',
      error: `X ${res.status}: ${errText.slice(0, 400)}`,
    };
  }

  const json: any = await res.json().catch(() => ({}));
  const id = json?.data?.id as string | undefined;
  return {
    success: true,
    mode: 'x',
    externalId: id,
    externalUrl: id ? `https://x.com/DevelopCoaching/status/${id}` : undefined,
  };
}

// --- v1.1 simple media upload (multipart so the binary stays out of the OAuth signature) ---
async function uploadMedia(imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed: ${imgRes.status}`);
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';

  const form = new FormData();
  form.append('media', new Blob([bytes], { type: contentType }));

  // multipart/form-data body params are excluded from the OAuth signature base,
  // so we sign with no extra params — same as a bare authenticated POST.
  const res = await fetch(MEDIA_URL, {
    method: 'POST',
    headers: { Authorization: oauthHeader('POST', MEDIA_URL, {}) },
    body: form,
  });
  if (!res.ok) throw new Error(`media upload ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json: any = await res.json();
  const id = json?.media_id_string;
  if (!id) throw new Error(`media upload returned no media_id_string`);
  return id;
}

// --- OAuth 1.0a HMAC-SHA1 ---
// `extraParams` are request query/form params that participate in the signature.
// For JSON-body (v2 tweet) and multipart (v1.1 media) requests there are none.
function oauthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string>
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: process.env.X_API_KEY!,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN!,
    oauth_version: '1.0',
  };

  // Signature base string
  const allParams = { ...oauth, ...extraParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${enc(k)}=${enc(allParams[k])}`)
    .join('&');
  const baseString = [method.toUpperCase(), enc(url), enc(paramString)].join('&');

  const signingKey = `${enc(process.env.X_API_SECRET!)}&${enc(process.env.X_ACCESS_TOKEN_SECRET!)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams: Record<string, string> = { ...oauth, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${enc(k)}="${enc(headerParams[k])}"`)
      .join(', ')
  );
}

// RFC 3986 percent-encoding (encodeURIComponent leaves !*'() unescaped)
function enc(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}
