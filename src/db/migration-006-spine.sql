-- Migration 006: day-spine + cadence support for the monthly content calendar
-- ============================================================================
-- Adds the "spine" (per-week, per-day topic/hook/SCAMPER/CTA backbone) so a
-- generated month is coherent and hits Greg's real cadence (5 pieces/day,
-- daily article, 4 reels/week) instead of a thin per-week platform total.
--
-- Safe to run repeatedly (all `if not exists`).

-- The full generated spine for a calendar: array of weeks, each with 7 days.
alter table greg_monthly_calendars
  add column if not exists spine jsonb;

-- Per-post coherence tags so the approval queue can show the day's theme and
-- group a day's pieces together.
alter table greg_content_queue
  add column if not exists spine_topic text,   -- the day's single topic
  add column if not exists hook text,          -- the day's hook line
  add column if not exists cta text,           -- the week's CTA (funnel ladder)
  add column if not exists week_number int,    -- 1-4 within the month
  add column if not exists day_of_week text;   -- Mon..Sun

-- Defensive: columns generate-week already writes to, in case they were added
-- directly in Supabase rather than via a tracked migration.
alter table greg_content_queue
  add column if not exists graphic_prompt text,
  add column if not exists source_context text;

-- Helpful index for reading a calendar's queue back in day order.
create index if not exists idx_content_queue_cal_date
  on greg_content_queue (calendar_id, scheduled_date);
