-- Migration: Scheduler + Publisher (Tab 5)
-- Adds publish-time tracking, mode flag, error/retry state, and a per-attempt log.
-- Run against Supabase project: homnpuxiopsxfsuawzzy
-- Date: 2026-04-17

alter table greg_content_queue
  add column if not exists scheduled_time timestamptz,
  add column if not exists publish_mode text default 'auto',     -- 'auto' | 'manual'
  add column if not exists publish_target text,                  -- platform-specific target id (buffer profile, IG ig_user_id, etc)
  add column if not exists published_url text,
  add column if not exists publish_attempts int default 0,
  add column if not exists last_publish_error text,
  add column if not exists posted_manually_at timestamptz,
  add column if not exists weekly_batch_id uuid;                 -- groups posts that went out in the same Monday summary

-- Backfill: if scheduled_date is set but scheduled_time isn't, schedule for 09:00 Australia/Sydney (12:00 UTC during AEDT)
update greg_content_queue
   set scheduled_time = (scheduled_date::timestamp + interval '12 hours') at time zone 'UTC'
 where scheduled_time is null and scheduled_date is not null;

-- Index so the dispatcher tick is cheap
create index if not exists greg_content_queue_due_idx
  on greg_content_queue (status, scheduled_time)
  where status in ('scheduled', 'approved');

-- ============================================================
-- greg_publish_log — append-only audit of every publish attempt
-- ============================================================
create table if not exists greg_publish_log (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references greg_content_queue(id) on delete cascade,
  platform text not null,
  mode text not null,                  -- 'buffer' | 'meta_ig' | 'meta_fb' | 'linkedin' | 'manual_slack'
  attempt_at timestamptz default now(),
  success boolean not null,
  external_id text,                    -- buffer update id, IG media id, LinkedIn URN, etc
  external_url text,
  error_message text,
  payload_excerpt text                 -- first 500 chars of caption for debugging
);

create index if not exists greg_publish_log_queue_idx on greg_publish_log (queue_id, attempt_at desc);

-- ============================================================
-- greg_weekly_batches — Monday digest tracking
-- ============================================================
create table if not exists greg_weekly_batches (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,            -- Monday of the week these posts cover
  sent_at timestamptz default now(),
  slack_message_ts text,               -- Slack timestamp so we can update the message after approval
  post_ids uuid[] not null,
  approved_at timestamptz,
  approved_by text                     -- 'slack:U123' or 'ui:chloe'
);

create unique index if not exists greg_weekly_batches_week_idx on greg_weekly_batches (week_start);
