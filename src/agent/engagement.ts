// Engagement Strategy Engine
// Reads Marketing/engagement-hooks.json + engagement-schedule.json and exposes
// helpers the planner, scheduler, Engagement Bot, Slack Command Centre, and
// The Oracle all import from. This is the single source of truth for engagement.
//
// Files read (not duplicated here — edit the JSON, not the TS):
//   Marketing/engagement-hooks.json     — 60+ hooks, categorised, Greg's voice
//   Marketing/engagement-schedule.json  — Mon-Sun mechanic rotation
//   Marketing/engagement-rules.md       — human-readable platform rules

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// greg-brain/src/agent → Marketing/engagement-hooks.json is 4 levels up
const MARKETING_ROOT = join(__dirname, '..', '..', '..', '..');

export type EngagementType =
  | 'open_question'
  | 'poll'
  | 'comment_to_get'
  | 'tag_prompt'
  | 'contrarian_hook'
  | 'story_hook'
  | 'pin_comment'
  | 'soft_cta';

export type DayOfWeek =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday'
  | 'friday' | 'saturday' | 'sunday';

// Mapping between the categories in engagement-hooks.json and the engagement_type
// values the planner writes to greg_content_queue.
const CATEGORY_TO_TYPE: Record<string, EngagementType> = {
  question_hooks: 'open_question',
  poll_this_or_that: 'poll',
  comment_to_get: 'comment_to_get',
  tag_hooks: 'tag_prompt',
  contrarian_hooks: 'contrarian_hook',
  story_hooks: 'story_hook',
  pin_first_comment: 'pin_comment',
  soft_cta: 'soft_cta',
};

const TYPE_TO_CATEGORY: Record<EngagementType, string> = Object.fromEntries(
  Object.entries(CATEGORY_TO_TYPE).map(([k, v]) => [v, k])
) as Record<EngagementType, string>;

export interface Hook {
  id: string;
  text: string;
  category: string;
  engagement_type: EngagementType;
  notes?: string;
  trigger_word?: string;
  magnet?: string;
  magnet_url?: string;
}

export interface DaySchedule {
  primary_mechanic: string;
  hook_categories: string[];
  post_format: string;
  platforms: string[];
  engagement_goal: string;
  rationale: string;
}

interface HooksFile {
  meta: Record<string, unknown>;
  categories: Record<
    string,
    {
      description: string;
      platform_fit: string[];
      hooks: Array<Omit<Hook, 'category' | 'engagement_type'>>;
    }
  >;
  placeholder_tokens: Record<string, string>;
}

interface ScheduleFile {
  weekly_rotation: Record<DayOfWeek, DaySchedule>;
  weekly_mechanic_targets: Record<string, { min: number; max: number; preferred_days: string[] }>;
  platform_frequency: Record<string, { posts_per_week?: number; sends_per_week?: number; notes: string }>;
  override_rules: Record<string, { trigger: string; change: string }>;
}

let _hooksCache: HooksFile | null = null;
let _scheduleCache: ScheduleFile | null = null;

export function loadHooks(): HooksFile {
  if (_hooksCache) return _hooksCache;
  const path = join(MARKETING_ROOT, 'engagement-hooks.json');
  _hooksCache = JSON.parse(readFileSync(path, 'utf-8')) as HooksFile;
  return _hooksCache;
}

export function loadSchedule(): ScheduleFile {
  if (_scheduleCache) return _scheduleCache;
  const path = join(MARKETING_ROOT, 'engagement-schedule.json');
  _scheduleCache = JSON.parse(readFileSync(path, 'utf-8')) as ScheduleFile;
  return _scheduleCache;
}

/** Flatten all hooks into a single array, tagged with their category + engagement_type. */
export function allHooks(): Hook[] {
  const hooks = loadHooks();
  const out: Hook[] = [];
  for (const [category, block] of Object.entries(hooks.categories)) {
    const engagement_type = CATEGORY_TO_TYPE[category];
    if (!engagement_type) continue;
    for (const h of block.hooks) {
      out.push({ ...h, category, engagement_type });
    }
  }
  return out;
}

/** Get the schedule entry for a given day. */
export function getDaySchedule(day: DayOfWeek): DaySchedule {
  return loadSchedule().weekly_rotation[day];
}

export function dayOfWeekFor(date: Date): DayOfWeek {
  const names: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[date.getDay()];
}

/**
 * Pick a hook for a given day + platform, avoiding categories used in the last
 * `avoidRecent` posts so mechanics rotate. Weights toward top-performing hooks
 * when performance data is available.
 */
export async function pickHookForPost(opts: {
  date: Date;
  platform: string;
  avoidEngagementTypes?: EngagementType[];
  supabase?: ReturnType<typeof createClient>;
}): Promise<Hook> {
  const day = dayOfWeekFor(opts.date);
  const schedule = getDaySchedule(day);

  // Candidate categories = today's primary categories, minus anything we're avoiding.
  const candidateCategories = schedule.hook_categories.filter((cat) => {
    const type = CATEGORY_TO_TYPE[cat];
    return type && !opts.avoidEngagementTypes?.includes(type);
  });

  const categoriesToUse = candidateCategories.length > 0
    ? candidateCategories
    : schedule.hook_categories;

  const hooks = loadHooks();
  const pool: Hook[] = [];
  for (const cat of categoriesToUse) {
    const block = hooks.categories[cat];
    if (!block) continue;
    if (!block.platform_fit.includes(opts.platform)) continue;
    for (const h of block.hooks) {
      pool.push({
        ...h,
        category: cat,
        engagement_type: CATEGORY_TO_TYPE[cat],
      });
    }
  }

  if (pool.length === 0) {
    // Fallback: any hook in today's categories regardless of platform fit.
    for (const cat of categoriesToUse) {
      const block = hooks.categories[cat];
      if (!block) continue;
      for (const h of block.hooks) {
        pool.push({ ...h, category: cat, engagement_type: CATEGORY_TO_TYPE[cat] });
      }
    }
  }

  // Weight by performance if Supabase is wired up. Hooks with higher avg engagement
  // get picked more often. Unused hooks get a neutral weight so the library explores.
  if (opts.supabase) {
    const { data } = await opts.supabase
      .from('greg_hook_performance')
      .select('hook_id, avg_total_engagement, uses')
      .in('hook_id', pool.map((h) => h.id));

    const perf = new Map((data ?? []).map((r: any) => [r.hook_id, r]));
    const weighted = pool.map((h) => {
      const p = perf.get(h.id) as { avg_total_engagement?: number; uses?: number } | undefined;
      const uses = p?.uses ?? 0;
      const score = p?.avg_total_engagement ?? 0;
      // Thompson-ish: new hooks get a baseline (explore); proven hooks get lift (exploit).
      const weight = uses < 3 ? 1 : 0.5 + score / 50;
      return { hook: h, weight };
    });
    return weightedPick(weighted);
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

function weightedPick<T>(items: { hook: T; weight: number }[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.hook;
  }
  return items[items.length - 1].hook;
}

/**
 * Substitute placeholder tokens in a hook's text.
 * Replaces {TRAINING}, {TRIGGER}, {TOPIC}, {NUMBER}, {WORKSHOP_NAME}, {MAGNET_URL}.
 */
export function fillHookTokens(
  hookText: string,
  values: Partial<{
    TRAINING: string;
    TRIGGER: string;
    TOPIC: string;
    NUMBER: string;
    WORKSHOP_NAME: string;
    MAGNET_URL: string;
  }>
): string {
  let out = hookText;
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) continue;
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

/**
 * Record a post's hook usage to greg_engagement_performance so we can learn
 * from it. Call this when a post is published, not when it's drafted.
 */
export async function recordHookUse(
  supabase: ReturnType<typeof createClient>,
  params: {
    postId: string;
    platformPostId?: string;
    hook: Hook;
    platform: string;
    postedDate: Date;
  }
): Promise<void> {
  await supabase.from('greg_engagement_performance').insert({
    post_id: params.postId,
    platform_post_id: params.platformPostId ?? null,
    engagement_type: params.hook.engagement_type,
    hook_id: params.hook.id,
    hook_text: params.hook.text,
    platform: params.platform,
    posted_date: params.postedDate.toISOString().split('T')[0],
    scheduled_day_of_week: dayOfWeekFor(params.postedDate),
    trigger_word: params.hook.trigger_word ?? null,
    magnet_url: params.hook.magnet_url ?? null,
  });
}

/**
 * Platform-specific guardrails injected into the planner's system prompt so
 * Claude generates posts that already follow the engagement rules.
 */
export function platformRulesPrompt(platform: string): string {
  const base = `PLATFORM: ${platform}\n`;
  switch (platform) {
    case 'instagram_post':
      return base +
`- End with a question or a comment-to-get trigger.
- 3-5 hashtags, at the end only, on their own line.
- 100-200 word caption. Hook in the first line. Max 2 emojis in the body.`;
    case 'instagram_reel':
      return base +
`- Hook in the first 2 seconds (first line of HOOK:).
- Verbal CTA in the CLOSE.
- A separate pinned-first-comment line should be generated in the caption field for Chloe to pin.
- 80-150 word caption. 3-5 hashtags at end.`;
    case 'linkedin_post':
    case 'linkedin_article':
      return base +
`- Always end with a question.
- Line breaks between paragraphs (1-3 sentences each).
- 3-5 hashtags at the end only. No inline tags. No links in the body — put any link in the first comment.`;
    case 'facebook':
      return base +
`- Longer caption (200-400 words) is rewarded.
- End with "Share if you agree" or a share prompt on contrarian takes.
- Hashtags optional, max 3.`;
    case 'email':
      return base +
`- Subject line IS the hook. Keep it under 55 chars.
- 200-400 words, conversational. One question OR one link at the end, not both.`;
    case 'x':
      return base +
`- Under 280 chars. No hashtags. Contrarian hooks land hardest.`;
    default:
      return base;
  }
}

/** Planner-facing summary: "this is what today wants". Drop into the system prompt. */
export function engagementBriefForWeek(weekStart: Date): string {
  const schedule = loadSchedule();
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const day = dayOfWeekFor(d);
    const s = schedule.weekly_rotation[day];
    out.push(`- ${day}: ${s.primary_mechanic} (${s.engagement_goal})`);
  }
  return `WEEKLY ENGAGEMENT ROTATION:\n${out.join('\n')}\n\nWEEKLY TARGETS: ${
    Object.entries(schedule.weekly_mechanic_targets)
      .map(([k, v]) => `${k}=${v.min}-${v.max}`).join(', ')
  }`;
}
