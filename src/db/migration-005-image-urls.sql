-- Migration: add image_urls to greg_content_queue (carousel support)
--
-- migration-001-images.sql defined this column but was never applied to the
-- live DB, so scheduled posts could only carry a single image (via publish_target).
-- This adds the array column the publisher adapters already read, enabling true
-- Instagram + Facebook carousels from the queue. Additive + nullable: existing
-- single-image rows are unaffected (image_urls stays null and the adapters fall
-- back to publish_target / asset_url as before).
--
-- Apply in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> Run):

alter table greg_content_queue
  add column if not exists image_urls text[];
