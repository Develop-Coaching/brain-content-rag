// Meta Conversions API client. Sends server-side Purchase events that dedupe
// against the browser pixel via shared event_id.

import crypto from 'node:crypto';

const META_GRAPH_VERSION = 'v19.0';

export type PurchasePayload = {
  eventId: string;
  email: string;
  value: number;
  currency: string;
  contentName: string;
  eventSourceUrl: string;
  fbc?: string;
  fbp?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  eventTimeSeconds?: number;
};

export async function sendPurchaseEvent(payload: PurchasePayload) {
  const pixelId = required('META_PIXEL_ID');
  const accessToken = required('META_CAPI_ACCESS_TOKEN');

  const userData: Record<string, string> = {
    em: sha256(payload.email.trim().toLowerCase()),
  };
  if (payload.fbc) userData.fbc = payload.fbc;
  if (payload.fbp) userData.fbp = payload.fbp;
  if (payload.clientIpAddress) userData.client_ip_address = payload.clientIpAddress;
  if (payload.clientUserAgent) userData.client_user_agent = payload.clientUserAgent;

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_id: payload.eventId,
        event_time: payload.eventTimeSeconds ?? Math.floor(Date.now() / 1000),
        event_source_url: payload.eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: {
          value: payload.value,
          currency: payload.currency,
          content_name: payload.contentName,
        },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Meta CAPI ${res.status}: ${responseText}`);
  }
  return JSON.parse(responseText);
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
