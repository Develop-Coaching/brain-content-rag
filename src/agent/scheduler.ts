// Buffer API integration for scheduling approved posts
// Handles: LinkedIn, X/Twitter, Instagram

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ContentQueueItem {
  id: string;
  platform: string;
  draft_content: string;
  scheduled_date: string;
}

export async function schedulePost(post: ContentQueueItem): Promise<boolean> {
  const supabase = getSupabase();
  const bufferToken = process.env.BUFFER_ACCESS_TOKEN;
  if (!bufferToken) {
    console.log('Buffer not configured - skipping scheduling');
    return false;
  }

  const PLATFORM_PROFILE_IDS: Record<string, string | undefined> = {
    linkedin: process.env.BUFFER_LINKEDIN_PROFILE_ID,
    x: process.env.BUFFER_X_PROFILE_ID,
  };
  const profileId = PLATFORM_PROFILE_IDS[post.platform];
  if (!profileId) {
    console.log(
      `No Buffer profile configured for platform: ${post.platform}`
    );
    return false;
  }

  const response = await fetch(
    'https://api.bufferapp.com/1/updates/create.json',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${bufferToken}` },
      body: new URLSearchParams({
        profile_id: profileId,
        text: post.draft_content,
        scheduled_at: new Date(post.scheduled_date).toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Buffer API error: ${response.status} - ${errorText}`);
    return false;
  }

  // Update status in Supabase
  const { error } = await supabase
    .from('greg_content_queue')
    .update({ status: 'scheduled' })
    .eq('id', post.id);

  if (error) {
    console.error(`Failed to update post status: ${error.message}`);
    return false;
  }

  console.log(
    `Scheduled ${post.platform} post for ${post.scheduled_date}`
  );
  return true;
}

export async function scheduleApprovedPosts(): Promise<{
  scheduled: number;
  failed: number;
}> {
  const supabase = getSupabase();
  // Get all approved posts that haven't been scheduled yet
  const { data: posts, error } = await supabase
    .from('greg_content_queue')
    .select('id, platform, draft_content, scheduled_date')
    .eq('status', 'approved')
    .order('scheduled_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch approved posts: ${error.message}`);
  }

  if (!posts || posts.length === 0) {
    console.log('No approved posts to schedule');
    return { scheduled: 0, failed: 0 };
  }

  console.log(`Scheduling ${posts.length} approved posts...`);

  let scheduled = 0;
  let failed = 0;

  for (const post of posts) {
    const success = await schedulePost(post);
    if (success) {
      scheduled++;
    } else {
      failed++;
    }

    // Small delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`Scheduling complete: ${scheduled} scheduled, ${failed} failed`);
  return { scheduled, failed };
}
