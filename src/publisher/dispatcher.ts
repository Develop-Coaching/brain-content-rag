// The publish "tick" — runs every few minutes (cron / GitHub Action / Vercel cron),
// finds posts whose scheduled_time has passed and status is 'scheduled',
// chooses the best available adapter for each platform, runs it, logs the
// attempt, and either marks 'published' or falls back to manual Slack.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

import type { AdapterMode, Platform, PublishResult, QueuePost } from './types.js';
import { bufferConfigured, publishToBuffer } from './adapters/buffer.js';
import {
  metaIgConfigured,
  metaFbConfigured,
  publishToInstagram,
  publishToFacebook,
} from './adapters/meta.js';
import { linkedInConfigured, publishToLinkedIn } from './adapters/linkedin.js';
import { youtubeConfigured, publishToYouTube } from './adapters/youtube.js';
import { manualSlackConfigured, notifyManualPost } from './adapters/manual-slack.js';

const MAX_AUTO_ATTEMPTS = 3;

function supa(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ---------------------------------------------------------------------------
// Adapter selection
// ---------------------------------------------------------------------------

// PUBLISHER_PLATFORM_MODE lets you force "manual" for a platform regardless
// of what API tokens are set, e.g. PUBLISHER_PLATFORM_MODE=instagram:manual,linkedin:auto
function platformOverride(platform: Platform): 'auto' | 'manual' | null {
  const raw = process.env.PUBLISHER_PLATFORM_MODE;
  if (!raw) return null;
  for (const part of raw.split(',')) {
    const [p, mode] = part.split(':').map((s) => s.trim());
    if (p === platform && (mode === 'auto' || mode === 'manual')) return mode;
  }
  return null;
}

// In priority order: prefer Buffer (single account, simplest), then platform-direct.
function pickAdapter(post: QueuePost): {
  run: () => Promise<PublishResult>;
  mode: AdapterMode;
} {
  const override = platformOverride(post.platform);
  if (override === 'manual') {
    return { run: () => notifyManualPost(post), mode: 'manual_slack' };
  }

  if (bufferConfigured(post.platform)) {
    return { run: () => publishToBuffer(post), mode: 'buffer' };
  }

  switch (post.platform) {
    case 'instagram':
    case 'instagram_caption':
      if (metaIgConfigured()) return { run: () => publishToInstagram(post), mode: 'meta_ig' };
      break;
    case 'facebook':
      if (metaFbConfigured()) return { run: () => publishToFacebook(post), mode: 'meta_fb' };
      break;
    case 'linkedin':
      if (linkedInConfigured()) return { run: () => publishToLinkedIn(post), mode: 'linkedin' };
      break;
    case 'youtube':
      if (youtubeConfigured()) return { run: () => publishToYouTube(post), mode: 'youtube' };
      break;
  }

  // Fallback: notify Chloe in Slack
  return { run: () => notifyManualPost(post), mode: 'manual_slack' };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export interface TickResult {
  considered: number;
  published: number;
  manual: number;
  failed: number;
  details: Array<{ id: string; platform: string; mode: AdapterMode; success: boolean; error?: string }>;
}

export async function publishTick(now: Date = new Date()): Promise<TickResult> {
  const db = supa();

  // Pull anything due. We accept 'scheduled' (Chloe approved + queued) or
  // 'approved' as a courtesy (e.g. backfill of older rows that never moved).
  const { data: due, error } = await db
    .from('greg_content_queue')
    .select('*')
    .in('status', ['scheduled', 'approved'])
    .lte('scheduled_time', now.toISOString())
    .order('scheduled_time', { ascending: true })
    .limit(50);

  if (error) throw new Error(`fetch due posts failed: ${error.message}`);

  const posts = (due || []) as QueuePost[];
  const result: TickResult = { considered: posts.length, published: 0, manual: 0, failed: 0, details: [] };

  for (const post of posts) {
    const { run, mode } = pickAdapter(post);
    let outcome: PublishResult;
    try {
      outcome = await run();
    } catch (err) {
      outcome = {
        success: false,
        mode,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    await db.from('greg_publish_log').insert({
      queue_id: post.id,
      platform: post.platform,
      mode: outcome.mode,
      success: outcome.success,
      external_id: outcome.externalId,
      external_url: outcome.externalUrl,
      error_message: outcome.error,
      payload_excerpt: post.draft_content?.slice(0, 500),
    });

    const attempts = (post.publish_attempts ?? 0) + 1;

    if (outcome.success && outcome.mode === 'manual_slack') {
      // Manual mode: we've notified Chloe, but the post isn't "published" yet.
      await db
        .from('greg_content_queue')
        .update({
          publish_mode: 'manual',
          publish_attempts: attempts,
          last_publish_error: null,
        })
        .eq('id', post.id);
      result.manual++;
    } else if (outcome.success) {
      await db
        .from('greg_content_queue')
        .update({
          status: 'published',
          publish_mode: 'auto',
          publish_attempts: attempts,
          published_at: now.toISOString(),
          published_url: outcome.externalUrl ?? null,
          last_publish_error: null,
        })
        .eq('id', post.id);
      result.published++;
    } else {
      // Failure path: retry up to MAX_AUTO_ATTEMPTS, then escalate to manual Slack
      if (attempts >= MAX_AUTO_ATTEMPTS) {
        await db
          .from('greg_content_queue')
          .update({
            publish_mode: 'manual',
            publish_attempts: attempts,
            last_publish_error: outcome.error,
          })
          .eq('id', post.id);
        // Try to escalate
        try {
          const esc = await notifyManualPost(post);
          await db.from('greg_publish_log').insert({
            queue_id: post.id,
            platform: post.platform,
            mode: 'manual_slack',
            success: esc.success,
            external_id: esc.externalId,
            error_message: esc.success
              ? `Escalated after auto failure: ${outcome.error}`
              : esc.error,
            payload_excerpt: post.draft_content?.slice(0, 500),
          });
          result.manual++;
        } catch {
          result.failed++;
        }
      } else {
        await db
          .from('greg_content_queue')
          .update({
            publish_attempts: attempts,
            last_publish_error: outcome.error,
          })
          .eq('id', post.id);
        result.failed++;
      }
    }

    result.details.push({
      id: post.id,
      platform: post.platform,
      mode: outcome.mode,
      success: outcome.success,
      error: outcome.error,
    });

    // Small delay between API calls to be a polite citizen
    await new Promise((r) => setTimeout(r, 400));
  }

  return result;
}
