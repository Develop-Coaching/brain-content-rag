// Mode B fallback — when no auto-publish adapter is configured for a platform,
// we DM Chloe in Slack with the copy + image + a "Mark posted" button so she
// can post manually in 30 seconds. The button hits /api/posts/[id]/mark-posted.

import type { PublishResult, QueuePost } from '../types.js';

export function manualSlackConfigured(): boolean {
  return !!(process.env.SLACK_BOT_TOKEN && (process.env.SLACK_PUBLISH_CHANNEL_ID || process.env.SLACK_CONTENT_CHANNEL_ID));
}

export async function notifyManualPost(post: QueuePost): Promise<PublishResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel =
    process.env.SLACK_PUBLISH_CHANNEL_ID || process.env.SLACK_CONTENT_CHANNEL_ID;

  if (!token || !channel) {
    return {
      success: false,
      mode: 'manual_slack',
      error: 'Slack not configured (need SLACK_BOT_TOKEN + SLACK_PUBLISH_CHANNEL_ID or SLACK_CONTENT_CHANNEL_ID)',
    };
  }

  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(token);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const image = post.image_urls?.[0] || post.asset_url;
  const platformLabel = humanPlatform(post.platform);
  const scheduled = post.scheduled_time
    ? new Date(post.scheduled_time).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })
    : 'now';

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Post ready to publish — ${platformLabel}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Scheduled for:* ${scheduled} (Sydney)\n*Type:* ${post.post_type ?? 'post'}`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '```' + truncate(post.draft_content, 2800) + '```' },
    },
  ];

  if (image) {
    blocks.push({
      type: 'image',
      image_url: image,
      alt_text: post.description || 'post image',
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Mark posted ✅' },
        style: 'primary',
        action_id: 'mark_posted',
        value: post.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open in app' },
        url: `${appUrl}/content/publish?focus=${post.id}`,
      },
      ...(image
        ? [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Download image' },
              url: image,
            },
          ]
        : []),
    ],
  });

  const result = await slack.chat.postMessage({
    channel,
    text: `Post ready: ${platformLabel} — ${truncate(post.draft_content, 80)}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  });

  if (!result.ok) {
    return {
      success: false,
      mode: 'manual_slack',
      error: `Slack postMessage failed: ${result.error}`,
    };
  }

  return {
    success: true,
    mode: 'manual_slack',
    externalId: result.ts,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function humanPlatform(p: string): string {
  switch (p) {
    case 'linkedin': return 'LinkedIn';
    case 'instagram':
    case 'instagram_caption': return 'Instagram';
    case 'facebook': return 'Facebook';
    case 'x': return 'X';
    case 'email': return 'Email';
    default: return p;
  }
}
