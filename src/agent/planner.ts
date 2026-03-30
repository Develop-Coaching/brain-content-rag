// Monthly planning agent
// Runs on the 1st of each month (or manually triggered)
// Generates 4 weekly themes with 5-8 posts per theme across platforms

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

import { hybridSearch, type SearchResult } from './search.js';
import {
  GREG_SYSTEM_PROMPT,
  getSeasonalContext,
  formatMonth,
  formatMonthKey,
} from './voice.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface WeeklyTheme {
  week: number;
  theme: string;
  description: string;
  posts: GeneratedPost[];
}

interface GeneratedPost {
  platform: 'linkedin' | 'email' | 'x' | 'instagram_caption';
  post_type: string;
  content: string;
  description?: string;
  graphic_prompt?: string;
  scheduled_day: number;
}

interface MonthlyPlan {
  month: string;
  themes: string[];
  weeks: WeeklyTheme[];
}

async function getTopPerformingPosts(
  month: Date
): Promise<
  Array<{
    platform: string;
    draft_content: string;
    engagements: number;
  }>
> {
  const lastMonth = new Date(month);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStart = new Date(
    lastMonth.getFullYear(),
    lastMonth.getMonth(),
    1
  );
  const lastMonthEnd = new Date(month.getFullYear(), month.getMonth(), 1);

  const { data, error } = await supabase
    .from('greg_content_queue')
    .select(
      `
      platform,
      draft_content,
      performance_data (
        engagements
      )
    `
    )
    .gte('scheduled_date', lastMonthStart.toISOString())
    .lt('scheduled_date', lastMonthEnd.toISOString())
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data) return [];

  return data.map((post: any) => ({
    platform: post.platform,
    draft_content: post.draft_content,
    engagements: post.performance_data?.[0]?.engagements || 0,
  }));
}

export async function runMonthlyPlanning(month: Date): Promise<{
  calendarId: string;
  postsCreated: number;
}> {
  console.log(`\n=== Monthly Planning: ${formatMonth(month)} ===\n`);

  // 1. Get top performing posts from last month
  const topPosts = await getTopPerformingPosts(month);
  console.log(`Found ${topPosts.length} published posts from last month`);

  // 2. Determine seasonal context
  const seasonalContext = getSeasonalContext(month);
  console.log(`Seasonal context: ${seasonalContext}\n`);

  // 3. Query knowledge base for fresh angles from each framework area
  console.log('Querying knowledge base for content variety...');
  const planContent = await hybridSearch(
    'planning systems business foundations',
    5,
    'plan'
  );
  const attractContent = await hybridSearch(
    'lead generation architects marketing',
    5,
    'attract'
  );
  const convertContent = await hybridSearch(
    'sales conversion quoting pricing',
    5,
    'convert'
  );
  const deliverContent = await hybridSearch(
    'project delivery systems subcontractors',
    5,
    'deliver'
  );
  const scaleContent = await hybridSearch(
    'scaling team hiring growth',
    5,
    'scale'
  );

  const allContent = [
    ...planContent,
    ...attractContent,
    ...convertContent,
    ...deliverContent,
    ...scaleContent,
  ];
  console.log(`Retrieved ${allContent.length} knowledge base chunks\n`);

  // 4. Generate monthly plan via Claude (week by week to handle long content)
  const topPostsSummary =
    topPosts.length > 0
      ? topPosts
          .map(
            (p) =>
              `- ${p.platform}: "${p.draft_content.slice(0, 100)}..." (${p.engagements} engagements)`
          )
          .join('\n')
      : 'No published posts from last month yet (first run).';

  const knowledgeBaseSummary = allContent
    .map(
      (c) =>
        `[${c.framework_tags?.join(', ') || 'untagged'}] ${c.content.slice(0, 200)}...`
    )
    .join('\n\n');

  // Step 1: Get the 4 weekly themes
  console.log('Generating weekly themes...');
  const themesResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: GREG_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Generate 4 weekly content themes for ${formatMonth(month)}.

SEASONAL CONTEXT: ${seasonalContext}
WHAT PERFORMED WELL LAST MONTH: ${topPostsSummary}

Respond in JSON only:
{ "weeks": [{ "week": 1, "theme": "Theme Name", "description": "One sentence description" }] }`,
    }],
  });

  const themesText = themesResponse.content[0].type === 'text' ? themesResponse.content[0].text : '';
  const themesJson = JSON.parse(themesText.match(/\{[\s\S]*\}/)?.[0] || '{}');
  const weekThemes: { week: number; theme: string; description: string }[] = themesJson.weeks || [];
  console.log(`Themes: ${weekThemes.map(w => w.theme).join(' | ')}\n`);

  // Step 2: Generate each week's posts separately
  const plan: MonthlyPlan = {
    month: formatMonth(month),
    themes: weekThemes.map(w => w.theme),
    weeks: [],
  };

  for (const weekTheme of weekThemes) {
    console.log(`Generating Week ${weekTheme.week}: ${weekTheme.theme}...`);

    const weekResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: GREG_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Generate content for Week ${weekTheme.week} of ${formatMonth(month)}.
Theme: "${weekTheme.theme}" - ${weekTheme.description}

KNOWLEDGE BASE CONTENT TO DRAW FROM:
${knowledgeBaseSummary}

Generate exactly 8 posts for this week:
1. LinkedIn Article (platform: "linkedin_article") - 500-800 words, long-form deep dive
2. LinkedIn Post (platform: "linkedin_post") - 150-300 words, shorter punchy take
3. Email (platform: "email") - 200-400 words, conversational letter style
4. X/Twitter (platform: "x") - under 280 chars
5. Instagram Post (platform: "instagram_post") - 100-200 word caption
6. Instagram Reel (platform: "instagram_reel") - spoken script using HOOK: / BODY: / CLOSE: format
7. Carousel (platform: "carousel") - 5-7 slide titles with descriptions
8. One extra post on whichever platform fits best

IMPORTANT: Every post MUST include a "description" field:
- LinkedIn Article: 1-2 sentence teaser/summary
- LinkedIn Post: 1 sentence key takeaway
- Email: Subject line
- X/Twitter: same as content
- Instagram Post: 1 sentence hook for image overlay
- Instagram Reel: 80-150 word caption for underneath the reel
- Carousel: 1 sentence summary of what it covers
- Extra post: appropriate description for its platform

ALSO: For every post, include a "graphic_prompt" field - creative direction for the visual/graphic. Describe the image style, colours, text overlay, photo type, or illustration concept. Specific enough for a designer or AI image tool.

Spread scheduled_day values 1-7 across the week.

FORMATTING: Write all content as plain text. Use line breaks for paragraphs. Do NOT use HTML tags (no <p>, <br>, <strong>, <h2>, etc.). Do NOT use markdown formatting. Just write natural, clean plain text.

Respond in JSON only:
{ "posts": [{ "platform": "linkedin_article", "post_type": "deep_dive", "content": "Full content...", "description": "Description...", "graphic_prompt": "Image concept...", "scheduled_day": 1 }] }`,
      }],
    });

    const weekText = weekResponse.content[0].type === 'text' ? weekResponse.content[0].text : '';
    let weekPosts: GeneratedPost[];
    try {
      const weekJson = JSON.parse(weekText.match(/\{[\s\S]*\}/)?.[0] || '{}');
      weekPosts = weekJson.posts || [];
    } catch {
      console.error(`Failed to parse week ${weekTheme.week}, skipping`);
      weekPosts = [];
    }

    plan.weeks.push({
      week: weekTheme.week,
      theme: weekTheme.theme,
      description: weekTheme.description,
      posts: weekPosts,
    });

    console.log(`  Generated ${weekPosts.length} posts`);
  }

  console.log(
    `Generated plan with ${plan.themes.length} themes and ${plan.weeks.reduce((sum, w) => sum + w.posts.length, 0)} posts\n`
  );

  // 5. Store calendar to Supabase
  const { data: calendarData, error: calendarError } = await supabase
    .from('greg_monthly_calendars')
    .insert({
      month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`,
      themes: plan.themes,
      status: 'draft',
    })
    .select('id')
    .single();

  if (calendarError)
    throw new Error(`Failed to create calendar: ${calendarError.message}`);
  const calendarId = calendarData.id;

  // 6. Store each post to content_queue
  let postsCreated = 0;
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);

  for (const week of plan.weeks) {
    for (const post of week.posts) {
      // Calculate scheduled date based on week and day
      const dayOffset = (week.week - 1) * 7 + (post.scheduled_day - 1);
      const scheduledDate = new Date(monthStart);
      scheduledDate.setDate(scheduledDate.getDate() + dayOffset);

      // Collect source chunk IDs used for this theme
      const relevantChunks = allContent
        .filter((c) =>
          c.framework_tags?.some((tag) =>
            week.theme.toLowerCase().includes(tag)
          )
        )
        .slice(0, 3)
        .map((c) => c.id);

      const { error: postError } = await supabase
        .from('greg_content_queue')
        .insert({
          calendar_id: calendarId,
          platform: post.platform,
          post_type: post.post_type,
          draft_content: post.content,
          description: post.description || null,
          graphic_prompt: post.graphic_prompt || null,
          source_chunk_ids: relevantChunks,
          scheduled_date: scheduledDate.toISOString().split('T')[0],
          status: 'draft',
        });

      if (postError) {
        console.error(`Failed to store post: ${postError.message}`);
      } else {
        postsCreated++;
      }
    }
  }

  console.log(
    `Stored calendar ${calendarId} with ${postsCreated} posts to Supabase`
  );

  return { calendarId, postsCreated };
}

export async function notifyChloe(month: Date): Promise<void> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CONTENT_CHANNEL_ID;

  if (!slackToken || !channelId) {
    console.log(
      'Slack not configured - skipping notification. Set SLACK_BOT_TOKEN and SLACK_CONTENT_CHANNEL_ID.'
    );
    return;
  }

  const { WebClient } = await import('@slack/web-api');
  const slack = new WebClient(slackToken);

  const monthName = formatMonth(month);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const reviewUrl = `${appUrl}/content/review/${formatMonthKey(month)}`;

  await slack.chat.postMessage({
    channel: channelId,
    text: `Content calendar for ${monthName} is ready for review. ${reviewUrl}`,
  });

  console.log(`Slack notification sent to #content channel`);
}
