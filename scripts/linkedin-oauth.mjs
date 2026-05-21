// One-shot LinkedIn OAuth helper for the Publisher.
//
// Usage:
//   LINKEDIN_CLIENT_ID=xxx LINKEDIN_CLIENT_SECRET=yyy node scripts/linkedin-oauth.mjs
//
// What it does:
//   1. Spins up http://localhost:8080/callback
//   2. Opens the LinkedIn consent page in your browser
//   3. Catches the redirect, exchanges code for access_token
//   4. Calls /v2/userinfo for the person URN
//   5. Writes LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN to .env
//   6. Prints next-step instructions for the company-page URN
//
// Requirements in the LinkedIn app:
//   - Products added: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn"
//   - Auth tab → Authorized redirect URLs: http://localhost:8080/callback

import { createServer } from 'http';
import { URL } from 'url';
import { exec } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '..', '.env');

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080/callback';
// w_organization_social (company-page posting) requires LinkedIn's
// "Marketing Developer Platform" product, which needs manual approval.
// Apply at linkedin.com/developers/apps when ready to add company posting.
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first.');
  process.exit(1);
}

const state = Math.random().toString(36).slice(2);
const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('state', state);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:8080');
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>LinkedIn auth failed</h1><pre>${error || 'no code'}</pre>`);
    console.error('Auth error:', error || 'no code returned');
    server.close();
    process.exit(1);
  }

  if (returnedState !== state) {
    res.writeHead(400).end('state mismatch');
    server.close();
    process.exit(1);
  }

  try {
    const tokenRes = await fetchWithRetry(
      'https://www.linkedin.com/oauth/v2/accessToken',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      }
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(`token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    const accessToken = tokenJson.access_token;
    const expiresIn = tokenJson.expires_in;

    // Get person URN via OIDC userinfo
    const userRes = await fetchWithRetry('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userJson = await userRes.json();
    if (!userRes.ok || !userJson.sub) {
      throw new Error(`userinfo failed: ${JSON.stringify(userJson)}`);
    }

    const personUrn = `urn:li:person:${userJson.sub}`;
    const personName = userJson.name || '(unknown)';

    writeEnv({
      LINKEDIN_ACCESS_TOKEN: accessToken,
      LINKEDIN_AUTHOR_URN: personUrn,
    });

    const days = Math.round(expiresIn / 86400);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      `<h1>Done</h1>
       <p>Logged in as <b>${personName}</b>.</p>
       <p>Person URN: <code>${personUrn}</code></p>
       <p>Token valid for ~${days} days.</p>
       <p>You can close this tab.</p>`
    );

    console.log('');
    console.log('LinkedIn auth complete.');
    console.log(`  Person:       ${personName}`);
    console.log(`  Person URN:   ${personUrn}`);
    console.log(`  Token expiry: ~${days} days from now`);
    console.log('');
    console.log('Wrote LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN to .env');
    console.log('');
    console.log('Next: to also post to the Develop Coaching company page,');
    console.log('  open the company page in LinkedIn, click the three-dot menu,');
    console.log('  copy the page ID from the admin URL, and tell Claude.');

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
  console.log('Opening LinkedIn consent page...');
  exec(`open "${authUrl.toString()}"`);
});
