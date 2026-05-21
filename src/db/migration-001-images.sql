-- Migration: Add image generation and engagement tracking columns
-- Run against Supabase project: homnpuxiopsxfsuawzzy
-- Date: 2026-04-16

-- New columns on greg_content_queue for image generation
alter table greg_content_queue
  add column if not exists image_urls text[],          -- public URLs of generated images (Supabase Storage or local)
  add column if not exists image_paths text[],         -- local file paths for generated images
  add column if not exists engagement_type text;       -- which engagement tactic was used (for tracking performance)

-- Add description column if it doesn't exist yet (planner already writes it)
alter table greg_content_queue
  add column if not exists description text;

-- Add asset_url column if it doesn't exist yet (upload API references it)
alter table greg_content_queue
  add column if not exists asset_url text;

-- Comment for reference: engagement_type values will be one of:
--   'open_question'    - Open-ended question driving comments
--   'poll'             - This-or-that / poll style
--   'comment_to_get'   - "Comment X and I'll send you Y"
--   'tag_prompt'       - "Tag a builder who..."
--   'contrarian_hook'  - Unpopular opinion / challenge conventional thinking
--   'pin_comment'      - Pin first comment with question (reels)
--   'soft_cta'         - Generic follow/save/share CTA
