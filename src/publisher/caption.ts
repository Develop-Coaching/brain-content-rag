// Per-platform caption formatting + truncation. Keeps publish-time logic tiny
// so adapters all receive a string that is already safe for the target API.

import { PLATFORM_LIMITS, type Platform } from './types.js';

export interface FormattedCaption {
  body: string;
  truncated: boolean;
  hashtagsDropped: number;
}

const ELLIPSIS = '…';

function splitHashtags(input: string): { body: string; tags: string[] } {
  const lines = input.trimEnd().split('\n');
  const tags: string[] = [];
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (last && /^(#\w+\s*)+$/.test(last)) {
      tags.unshift(...last.split(/\s+/));
      lines.pop();
    } else {
      break;
    }
  }
  return { body: lines.join('\n').trimEnd(), tags };
}

export function formatCaption(platform: Platform, raw: string): FormattedCaption {
  const limits = PLATFORM_LIMITS[platform] ?? PLATFORM_LIMITS.linkedin;
  const { body, tags } = splitHashtags(raw);

  // Cap hashtag count
  let usedTags = tags.slice(0, limits.hashtags);
  let hashtagsDropped = tags.length - usedTags.length;

  let assembled = usedTags.length ? `${body}\n\n${usedTags.join(' ')}` : body;
  let truncated = false;

  if (assembled.length > limits.caption) {
    // Drop hashtags first
    while (usedTags.length && assembled.length > limits.caption) {
      usedTags.pop();
      hashtagsDropped++;
      assembled = usedTags.length ? `${body}\n\n${usedTags.join(' ')}` : body;
    }
  }

  if (assembled.length > limits.caption) {
    assembled = assembled.slice(0, limits.caption - 1) + ELLIPSIS;
    truncated = true;
  }

  return { body: assembled, truncated, hashtagsDropped };
}

// LinkedIn: posts > 1300 chars get auto-truncated in the feed with "see more".
// Mark which ones should run as an "article" instead. For now we only flag it.
export function isLinkedInArticleLength(raw: string): boolean {
  return raw.length > 2500;
}
