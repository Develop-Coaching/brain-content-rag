-- Engagement Strategy Engine (Tab 10)
-- Tracks every hook used on every post so the library learns what converts.
-- Lives alongside greg_content_queue. Joined on post_id.

-- ============================================================
-- Table: greg_engagement_performance
-- One row per post per engagement mechanic fired.
-- ============================================================
create table if not exists greg_engagement_performance (
  id uuid primary key default gen_random_uuid(),

  -- Link back to the originating post
  post_id uuid references greg_content_queue(id) on delete cascade,
  platform_post_id text,              -- Meta / LinkedIn platform ID once published

  -- The mechanic
  engagement_type text not null,      -- question | poll | comment_to_get | tag | contrarian | story | pin_comment | soft_cta
  hook_id text not null,              -- matches engagement-hooks.json ID (e.g. "q_01", "c_04")
  hook_text text not null,            -- frozen snapshot at post time (library can change later)

  -- Where it ran
  platform text not null,             -- instagram_post | instagram_reel | linkedin_post | linkedin_article | facebook | email | x
  posted_date date not null,
  scheduled_day_of_week text,         -- monday..sunday — so we can correlate with the weekly rotation

  -- Comment-to-get extras
  trigger_word text,                  -- if engagement_type = comment_to_get
  magnet_url text,                    -- if engagement_type = comment_to_get

  -- Outcome metrics (pulled by reporting jobs from Meta/LinkedIn insights)
  comments int default 0,
  saves int default 0,
  shares int default 0,
  likes int default 0,
  reach int default 0,
  impressions int default 0,

  -- Lead outcomes (for comment_to_get)
  leads int default 0,                -- rows in leads table joined on post_id
  dms_sent int default 0,
  workshop_registrations int default 0,

  -- Metadata
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

-- Index for hook-level aggregation (what's working?)
create index if not exists idx_engagement_hook_id
  on greg_engagement_performance(hook_id);

-- Index for mechanic-level aggregation (which categories land?)
create index if not exists idx_engagement_type_platform
  on greg_engagement_performance(engagement_type, platform);

-- Index for the monthly library refresh job
create index if not exists idx_engagement_posted_date
  on greg_engagement_performance(posted_date);

-- Index for lookup when a post's metrics come in
create index if not exists idx_engagement_post_id
  on greg_engagement_performance(post_id);

-- ============================================================
-- Add engagement_trigger_word to greg_content_queue
-- Needed so Engagement Bot can match inbound comments to the
-- right lead magnet without re-parsing the post body.
-- ============================================================
alter table greg_content_queue
  add column if not exists engagement_hook_id text,
  add column if not exists engagement_trigger_word text,
  add column if not exists engagement_magnet_url text;

-- ============================================================
-- View: greg_hook_performance
-- Aggregated view of each hook's lifetime performance.
-- Used by the monthly library refresh to retire/promote hooks.
-- ============================================================
create or replace view greg_hook_performance as
select
  hook_id,
  engagement_type,
  count(*) as uses,
  avg(comments) as avg_comments,
  avg(saves) as avg_saves,
  avg(shares) as avg_shares,
  avg(leads) as avg_leads,
  avg(comments + saves + shares) as avg_total_engagement,
  sum(leads) as total_leads,
  sum(workshop_registrations) as total_workshop_regs,
  max(posted_date) as last_used
from greg_engagement_performance
group by hook_id, engagement_type;

-- ============================================================
-- View: greg_mechanic_performance_by_day
-- Does Wednesday contrarian really beat Thursday contrarian?
-- Used by the schedule tuner.
-- ============================================================
create or replace view greg_mechanic_performance_by_day as
select
  engagement_type,
  scheduled_day_of_week,
  platform,
  count(*) as uses,
  avg(comments) as avg_comments,
  avg(saves) as avg_saves,
  avg(leads) as avg_leads,
  avg(reach) as avg_reach
from greg_engagement_performance
where scheduled_day_of_week is not null
group by engagement_type, scheduled_day_of_week, platform;
