// Greg's proven daily content rhythm.
// ---------------------------------------------------------------------------
// This is the single source of truth for what gets generated each day. It
// mirrors the gold-standard hand-built plan in
// Content Plans/2026-07-3wk-plan/00-master-calendar.md:
//
//   Mon  2 feed | article | Reel        | X thread
//   Tue  2 feed | article | Carousel    | 3 tweets
//   Wed  3 feed | article | Reel        | X poll
//   Thu  2 feed | article | Carousel    | Threads
//   Fri  2 feed | article | Reel        | X thread
//   Sat  2 feed | article | Carousel    | Threads
//   Sun  2 feed | article | Reel (wrap) | X thread
//
// => ~5 pieces/day, a LinkedIn article every day, exactly 4 reels/week
//    (Mon/Wed/Fri/Sun), every platform touched weekly.

export type HeavyType = 'reel' | 'carousel';

export type PieceRole =
  | 'feed'
  | 'article'
  | 'reel'
  | 'carousel'
  | 'x_thread'
  | 'x_poll'
  | 'x_tweets'
  | 'threads';

export interface PieceSpec {
  platform: string;   // value stored in greg_content_queue.platform
  post_type: string;  // value stored in greg_content_queue.post_type
  role: PieceRole;
  guideline: string;  // per-platform generation instruction
}

// weekday: JS getDay() convention, 0 = Sunday ... 6 = Saturday
export interface DayCadence {
  weekday: number;
  label: string;      // Mon..Sun
  heavy: HeavyType;
  feedCount: number;
  xRole: PieceRole;   // which X/Threads variant this day uses
}

const GUIDELINES: Record<PieceRole, string> = {
  feed: 'Instagram feed post: 100-200 word caption on the day topic. Open with the hook. End with a specific engagement CTA (e.g. "Comment WORD", "DM me X"), never "link in bio".',
  article: 'LinkedIn Article: 500-800 words, long-form deep dive on the day topic. Include a "description" field with a 1-2 sentence teaser.',
  reel: 'Instagram Reel: spoken script in HOOK: / BODY: / CLOSE: format built on the SCAMPER lens given. Include a "description" field: a 30-60 word caption that teases (does not transcribe) and ends on a trigger word.',
  carousel: 'Carousel: 5-7 slide titles each with a one-line description, on the day topic. Include a "description" field summarising the carousel.',
  x_thread: 'X/Twitter thread: 4-6 tweets, each under 280 chars, strong hook tweet first. Put the full thread in "content" (tweets separated by blank lines). "description" = the hook tweet.',
  x_poll: 'X/Twitter poll: a framing tweet + a poll question with 2-4 options. Put it all in "content". "description" = the poll question.',
  x_tweets: '3 standalone tweets on the day topic, each under 280 chars, different angles. Separate with blank lines in "content". "description" = the strongest tweet.',
  threads: 'Threads post: 100-200 words, conversational, on the day topic. "description" = key takeaway.',
};

// Mon..Sun, indexed for lookup by JS weekday below.
const WEEK: DayCadence[] = [
  { weekday: 1, label: 'Mon', heavy: 'reel',     feedCount: 2, xRole: 'x_thread' },
  { weekday: 2, label: 'Tue', heavy: 'carousel', feedCount: 2, xRole: 'x_tweets' },
  { weekday: 3, label: 'Wed', heavy: 'reel',     feedCount: 3, xRole: 'x_poll' },
  { weekday: 4, label: 'Thu', heavy: 'carousel', feedCount: 2, xRole: 'threads' },
  { weekday: 5, label: 'Fri', heavy: 'reel',     feedCount: 2, xRole: 'x_thread' },
  { weekday: 6, label: 'Sat', heavy: 'carousel', feedCount: 2, xRole: 'threads' },
  { weekday: 0, label: 'Sun', heavy: 'reel',     feedCount: 2, xRole: 'x_thread' },
];

export function dayCadence(weekday: number): DayCadence {
  return WEEK.find(d => d.weekday === weekday)!;
}

// Reels only fire on their scheduled days, so the 4/week cap is structural.
export const REELS_PER_WEEK = WEEK.filter(d => d.heavy === 'reel').length; // 4

// Build the ordered list of pieces to generate for one day.
export function buildDayPieces(weekday: number): PieceSpec[] {
  const day = dayCadence(weekday);
  const pieces: PieceSpec[] = [];

  for (let i = 0; i < day.feedCount; i++) {
    pieces.push({
      platform: 'instagram_post',
      post_type: 'feed_post',
      role: 'feed',
      guideline: GUIDELINES.feed + (day.feedCount > 1 ? ` (feed post ${i + 1} of ${day.feedCount} - a distinct angle on the day topic)` : ''),
    });
  }

  pieces.push({ platform: 'linkedin_article', post_type: 'article', role: 'article', guideline: GUIDELINES.article });

  if (day.heavy === 'reel') {
    pieces.push({ platform: 'instagram_reel', post_type: 'reel', role: 'reel', guideline: GUIDELINES.reel });
  } else {
    pieces.push({ platform: 'carousel', post_type: 'carousel', role: 'carousel', guideline: GUIDELINES.carousel });
  }

  const xPlatform = day.xRole === 'threads' ? 'threads' : 'x';
  pieces.push({ platform: xPlatform, post_type: day.xRole, role: day.xRole, guideline: GUIDELINES[day.xRole] });

  return pieces;
}

// Total pieces a standard week generates (for UI display / sanity checks).
export function weekPieceCount(): number {
  return WEEK.reduce((sum, d) => sum + buildDayPieces(d.weekday).length, 0);
}

// Hard guarantee of Greg's non-negotiable brand rules on generated copy,
// regardless of any model slip: no em dashes ever, and the domain is always
// the hyphenated develop-coaching.com (never developcoaching.co.uk / .com).
export function sanitizeCopy(s: unknown): string {
  if (s === null || s === undefined) return '';
  // Models sometimes return structured content (e.g. carousel slides as an
  // array/object) instead of a string, so coerce before cleaning.
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str
    .replace(/ *— */g, ', ')                              // em dash used as a pause -> comma
    .replace(/—/g, '-')                                   // any stray em dash
    .replace(/developcoaching\.co\.uk/gi, 'develop-coaching.com')
    .replace(/\bdevelopcoaching\.com\b/gi, 'develop-coaching.com');
}
