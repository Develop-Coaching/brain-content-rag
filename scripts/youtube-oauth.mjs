// One-shot YouTube OAuth helper.
//
// Usage:
//   YOUTUBE_CLIENT_ID=xxx YOUTUBE_CLIENT_SECRET=yyy node scripts/youtube-oauth.mjs
//
// Does the consent dance once, gets a long-lived refresh_token, writes it
// to .env. Adapter uses it from there on.
//
// Required in Google Cloud Console:
//   - OAuth 2.0 Client ID of type "Desktop app"
//   - OAuth consent screen configured (External, with Greg's account as test user)
//   - YouTube Data API v3 enabled on the project
//   - Authorized redirect: http://localhost:8080/callback

import { createServer } from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080/callback';
// `youtube` (manage) is needed to edit a video after upload (e.g. flip privacy);
// `youtube.upload` to create; `youtube.readonly` to verify channel/scopes.
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first.');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent'); // force refresh_token issuance

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8080');
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>Google auth failed</h1><pre>${error || 'no code'}</pre>`);
    console.error('Auth error:', error || 'no code returned');
    server.close();
    process.exit(1);
  }

  try {
    const tokenRes = await fetchWithRetry('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.refresh_token) {
      throw new Error(`token exchange failed (no refresh_token): ${JSON.stringify(tokenJson)}`);
    }

    const refreshToken = tokenJson.refresh_token;
    const accessToken = tokenJson.access_token;

    // Discover the channel
    const chRes = await fetchWithRetry(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const chJson = await chRes.json();
    const channel = chJson.items?.[0];
    const channelId = channel?.id || '(unknown)';
    const channelTitle = channel?.snippet?.title || '(unknown)';

    writeEnv({
      YOUTUBE_CLIENT_ID: CLIENT_ID,
      YOUTUBE_CLIENT_SECRET: CLIENT_SECRET,
      YOUTUBE_REFRESH_TOKEN: refreshToken,
      YOUTUBE_CHANNEL_ID: channelId,
    });

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      `<h1>Done</h1>
       <p>Channel: <b>${channelTitle}</b></p>
       <p>Channel ID: <code>${channelId}</code></p>
       <p>Refresh token saved. You can close this tab.</p>`
    );

    console.log('');
    console.log('YouTube auth complete.');
    console.log(`  Channel:    ${channelTitle}`);
    console.log(`  Channel ID: ${channelId}`);
    console.log('');
    console.log('Wrote YOUTUBE_REFRESH_TOKEN + YOUTUBE_CHANNEL_ID to .env (token lives forever unless revoked).');

    setTimeout(() => server.close(), 500);
  } catch (err) {
    res.writeHead(500).end(`error: ${err.message}`);
    console.error(err);
    server.close();
    process.exit(1);
  }
});

async function fetchWithRetry(url, init, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const signal = AbortSignal.timeout(30000);
      return await fetch(url, { ...init, signal });
    } catch (err) {
      lastErr = err;
      console.warn(`fetch attempt ${i + 1} failed: ${err.cause?.code || err.message}`);
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

function writeEnv(updates) {
  let lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n') : [];
  for (const [key, value] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const line = `${key}=${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  writeFileSync(ENV_PATH, lines.join('\n'));
}

server.listen(8080, () => {
  console.log('Local callback listening on http://localhost:8080/callback');
  console.log('AUTH_URL:' + authUrl.toString());
  if (process.env.YT_OAUTH_NO_OPEN !== '1') {
    console.log('Opening Google consent page...');
    exec(`open "${authUrl.toString()}"`);
  }
});
