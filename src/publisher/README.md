# Scheduler + Publisher (Tab 5)

Lives inside Greg Brain. Takes posts in `greg_content_queue` with status `scheduled` and either auto-publishes via API or notifies Chloe in Slack to post manually.

## Two modes (both always on)

| Mode | When it runs | Where it goes |
|------|--------------|---------------|
| **A. Auto-publish** | A platform's API tokens are set | LinkedIn / Instagram / Facebook / X |
| **B. Manual-ready** | API tokens missing OR auto-publish fails 3x OR `PUBLISHER_PLATFORM_MODE=<plat>:manual` | Slack DM to Chloe with copy + image + "Mark posted" button |

Mode A picks adapters in this order: **Buffer** → **Meta Graph (IG/FB)** → **LinkedIn UGC** → manual.

Buffer is preferred because it covers all four platforms with one OAuth and Greg Brain already has `BUFFER_*` env vars stubbed in `.env`.

## Setup

### 1. Run the migration

```sql
-- in Supabase SQL editor
\i src/db/migration-003-publisher.sql
```

### 2. Pick your publishing path

**Easiest — Buffer.** Sign up at buffer.com, connect your accounts, then in `~/.buffer-developer` create an app and grab the access token.

```bash
BUFFER_ACCESS_TOKEN=...
BUFFER_LINKEDIN_PROFILE_ID=...
BUFFER_INSTAGRAM_PROFILE_ID=...
BUFFER_FACEBOOK_PROFILE_ID=...
BUFFER_X_PROFILE_ID=...
```

**Direct — Meta Graph.** Create a Meta Business app, get a long-lived Page access token, link your IG Business account.

```bash
META_ACCESS_TOKEN=...               # user/app token (or)
META_PAGE_ACCESS_TOKEN=...          # page-scoped token, preferred for FB
META_IG_USER_ID=...                 # Instagram Business user id
META_FB_PAGE_ID=...                 # Facebook Page id
```

**Direct — LinkedIn.** Create a LinkedIn dev app with `w_member_social` scope.

```bash
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_AUTHOR_URN=urn:li:person:XXXXX   # or urn:li:organization:YYYYY
```

**Manual fallback (always recommended).** This is what makes Mode B work:

```bash
SLACK_BOT_TOKEN=xoxb-...                  # already set in greg-brain
SLACK_PUBLISH_CHANNEL_ID=C0AE...          # or reuse SLACK_CONTENT_CHANNEL_ID
SLACK_SIGNING_SECRET=...                  # for verifying the "Mark posted" button webhook
APP_URL=https://greg-brain.example.com    # used in Slack links
```

In your Slack app settings → **Interactivity & Shortcuts** → set Request URL to:

```
$APP_URL/api/slack/interactions
```

### 3. Set the cron

Two endpoints exist, both gated by `PUBLISHER_CRON_SECRET` (set it in env, then pass `Authorization: Bearer <secret>`):

| Cron | Endpoint | Frequency |
|------|----------|-----------|
| Publish tick | `POST /api/publish/tick` | every 5 min |
| Weekly digest | `POST /api/publish/weekly-summary` | Mondays 08:00 Australia/Sydney |

Use Vercel cron, GitHub Actions, or just `cron` on a box.

## CLI

```bash
npm run publish:tick                 # publish anything that's due now
npm run publish:tick -- --now=2026-04-20T12:00:00Z   # simulate a different "now"
npm run publish:weekly               # send the Monday digest
npm run publish:weekly -- --start=2026-04-20         # for a specific week
npm run publish:test                 # smoke test — inserts a manual post, ticks, cleans up
```

## Workflow (end state)

1. Greg Brain `npm run monthly` populates `greg_content_queue` with `status='draft'` posts.
2. Monday 08:00 — `publish:weekly` posts the digest to Slack.
3. Chloe taps **Approve all** (or per-post APPROVE/REJECT). Status flips to `scheduled`.
4. Every 5 min — `publish:tick` finds `scheduled` posts whose `scheduled_time` ≤ now.
5. For each, the dispatcher picks an adapter:
   - If Buffer/Meta/LinkedIn is configured → API publish. Status → `published`, `published_url` saved.
   - Otherwise → Slack DM to Chloe. Status stays `scheduled`, `publish_mode='manual'`. Tapping **Mark posted** flips it to `published`.
6. Failures retry up to 3 times, then escalate to Slack manual.

Every attempt is appended to `greg_publish_log` for debugging + monthly reporting.

## UI

Visit `/content/publish` for the weekly view: copy caption, download image, mark posted, jump to live URL. Defaults to current week, prev/next buttons jump 7 days.

## Caption rules

`src/publisher/caption.ts` enforces per-platform limits:

- IG: 2200 char hard / 1500 recommended / 30 hashtags
- LinkedIn: 3000 / 1300 / 5
- FB: 63 206 / 500 / 5
- X: 280 / 250 / 2

Excess hashtags drop first, then body truncates with `…`.

## Forcing manual mode per platform

Set `PUBLISHER_PLATFORM_MODE` to a comma-separated list:

```bash
PUBLISHER_PLATFORM_MODE=instagram:manual,linkedin:auto
```

Useful when Buffer can do everything but you want IG to stay manual for now.
