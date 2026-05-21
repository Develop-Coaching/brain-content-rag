-- Migration: Add image_style column to track which visual style was used per post
-- Run against Supabase project: homnpuxiopsxfsuawzzy
-- Date: 2026-04-16

alter table greg_content_queue
  add column if not exists image_style text;

-- Possible values:
--   'whiteboard_single'    - Hand-drawn whiteboard, Gemini 3 Pro + reference images
--   'whiteboard_carousel'  - Multi-slide whiteboard carousel
--   'cartoon_greg'         - Illustrated Greg character in a scene
--   'realistic_greg'       - Real photo of Greg composited into a scene
--   'quote_card'           - Bold text on DC brand gradient, no character
--   'stat_blast'           - Big stat/number post with supporting text
--   'branded_image'        - Generic branded graphic (fallback)
--   null                   - No image (x, email, reel thumbnails)
