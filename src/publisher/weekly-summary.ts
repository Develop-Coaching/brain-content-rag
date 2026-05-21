// Monday morning Slack digest. Gathers the next 7 days of posts that are
// still in 'draft' or 'approved' (i.e. not yet locked in for publish), and
// posts a single message with an "Approve all" button + per-post review links.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

function supa(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export interface WeeklySummaryResult {
  week_start: string;
  posts: number;
  batch_id: string | null;
  slack_ts: string | null;
  skipped?: string;
}

export async function sendWeeklySummary(
  weekStart: Date = mondayOf(new Date())
): Promise<WeeklySummaryResult> {
  const db = supa();
  const start = weekStart.toISOString().slice(0, 10);
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 7);
  const end = endDate.toISOString().slice(0, 10);

  const { data: posts, error } = await db
    .from('greg_content_queue')
    .select('id, platform, post_type, draft_content, scheduled_date, scheduled_time, status, image_urls, asset_url')
    .gte('scheduled_date', start)
    .lt('scheduled_date', end)
    .in('status', ['draft', 'approved'])
    .order('scheduled_time', { ascending: true });

  if (error) throw new Error(`fetch week posts failed: ${error.message}`);

  if (!posts || posts.length === 0) {
    return { week_start: start, posts: 0, batch_id: null, slack_ts: null, skipped: 'no posts' };
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_PUBLISH_CHANNEL_ID || process.env.SLACK_CONTENT_CHANNEL_ID;
  if (!token || !channel) {
    return { week_start: start, posts: posts.length, batch_id: null, slack_ts: null, skipped: 'slack not configured' };
  }

  // Persist the batch first so the button has an id to act on.
  const ids = posts.map((p) => p.id);
  const { data: batch, error: batchErr } = await db
    .from('greg_weekly_batches')
    .upsert(
      { week_start: start, post_ids: ids },
      { onConflict: 'week_start' }
    )
    .select()
    .single();

  if (batchErr || !batch) throw new Error(`upsert batch failed: ${batchErr?.message}`);

  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(token);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const byDay = posts.reduce<Record<string, typeof posts>>((acc, p) => {
    const k = p.scheduled_date ?? 'unscheduled';
    (acc[k] ||= [] as any).push(p);
    return acc;
  }, {});

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `This week's posts (${posts.length})` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Week of *${start}* — review below or smash *Approve all* to schedule everything as-is.\n<${appUrl}/content/publish?start=${start}|Open weekly view>`,
      },
    },
    { type: 'divider' },
  ];

  for (const [day, dayPosts] of Object.entries(byDay)) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${day}*` },
    });
    for (const p of dayPosts) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${platformLabel(p.platform)}* — ${truncate(p.draft_content, 180)}`,
        },
        accessory: {
          type: 'overflow',
          action_id: `review_${p.id}`,
          options: [
            { text: { type: 'plain_text', text: 'Open' }, value: `open:${p.id}`, url: `${appUrl}/content/publish?focus=${p.id}` } as any,
          ],
        },
      });
    }
    blocks.push({ type: 'divider' });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        style: 'primary',
        text: { type: 'plain_text', text: `✅ Approve all ${posts.length}` },
        action_id: 'approve_all_week',
        value: batch.id,
        confirm: {
          title: { type: 'plain_text', text: 'Approve all posts this week?' },
          text: { type: 'mrkdwn', text: `${posts.length} posts will move to *scheduled* and publish at their scheduled times.` },
          confirm: { type: 'plain_text', text: 'Approve all' },
          deny: { type: 'plain_text', text: 'Cancel' },
        },
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Review individually' },
        url: `${appUrl}/content/publish?start=${start}`,
      },
    ],
  });

  const result = await slack.chat.postMessage({
    channel,
    text: `This week's posts (${posts.length}) — reply APPROVE ALL or review individually`,
    blocks,
    unfurl_links: false,
  });

  if (result.ok && result.ts) {
    await db
      .from('greg_weekly_batches')
      .update({ slack_message_ts: result.ts })
      .eq('id', batch.id);
  }

  return {
    week_start: start,
    posts: posts.length,
    batch_id: batch.id,
    slack_ts: result.ts ?? null,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
function platformLabel(p: string): string {
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
