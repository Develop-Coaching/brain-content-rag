// Shared types for the Scheduler + Publisher (Tab 5)

export type Platform =
  | 'linkedin'
  | 'instagram_caption'
  | 'instagram'
  | 'facebook'
  | 'x'
  | 'youtube'
  | 'email';

export type PublishMode = 'auto' | 'manual';

export type AdapterMode =
  | 'buffer'
  | 'meta_ig'
  | 'meta_fb'
  | 'linkedin'
  | 'x'
  | 'youtube'
  | 'manual_slack';

export interface QueuePost {
  id: string;
  calendar_id: string | null;
  platform: Platform;
  post_type: string | null;
  draft_content: string;
  description: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;     // ISO timestamp
  status: string;
  publish_mode: PublishMode | null;
  publish_target: string | null;
  image_urls: string[] | null;
  asset_url: string | null;
  publish_attempts: number | null;
  last_publish_error: string | null;
  published_url: string | null;
  weekly_batch_id: string | null;
  chloe_notes: string | null;
}

export interface PublishResult {
  success: boolean;
  mode: AdapterMode;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

export interface PlatformLimits {
  caption: number;     // hard limit before publish will reject
  recommended: number; // soft target
  hashtags: number;
}

export const PLATFORM_LIMITS: Record<string, PlatformLimits> = {
  instagram: { caption: 2200, recommended: 1500, hashtags: 30 },
  instagram_caption: { caption: 2200, recommended: 1500, hashtags: 30 },
  facebook: { caption: 63206, recommended: 500, hashtags: 5 },
  linkedin: { caption: 3000, recommended: 1300, hashtags: 5 },
  x: { caption: 280, recommended: 250, hashtags: 2 },
  youtube: { caption: 5000, recommended: 1000, hashtags: 15 },
  email: { caption: 100000, recommended: 5000, hashtags: 0 },
};
