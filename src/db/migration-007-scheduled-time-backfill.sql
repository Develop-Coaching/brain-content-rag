-- migration-007: backfill scheduled_time from scheduled_date.
--
-- Numbered 007 deliberately: main already carries migration-006-spine.sql,
-- and an earlier abandoned attempt at this change also used 006.
--
-- Context: the dispatcher gates on `.lte('scheduled_time', now)`. A NULL
-- scheduled_time never matches, so every row written with only a
-- scheduled_date was skipped on every tick, silently, forever.
--
-- SAFETY: scoped to scheduled_date >= CURRENT_DATE on purpose. Past-dated
-- rows are deliberately left NULL. Backfilling them would make a backlog of
-- stale posts instantly due and publish them in one burst on the next tick.
-- Past rows stay dormant for manual review.
--
-- 09:00 Europe/London is the default posting hour, matching londonTimeToUtcIso()
-- in app/lib/schedule.ts. AT TIME ZONE resolves BST/GMT from the IANA database,
-- so this agrees with the application helper across DST boundaries.

UPDATE greg_content_queue
SET    scheduled_time = ((scheduled_date + TIME '09:00') AT TIME ZONE 'Europe/London')
WHERE  scheduled_time IS NULL
  AND  scheduled_date IS NOT NULL
  AND  scheduled_date >= CURRENT_DATE;

-- Verify: expect 0 rows still missing a time among current/future posts.
-- SELECT count(*) FROM greg_content_queue
-- WHERE scheduled_time IS NULL AND scheduled_date >= CURRENT_DATE;
