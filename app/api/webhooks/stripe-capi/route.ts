// Stripe → Meta CAPI bridge.
//
// Stripe Dashboard → Developers → Webhooks: add this URL and subscribe to
// `checkout.session.completed`. Use STRIPE_WEBHOOK_SECRET as the signing
// secret. The browser pixel must pass its event_id (plus fbc/fbp) into
// Stripe checkout metadata so this server-side event dedupes against it.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendPurchaseEvent } from '../../../../src/capi/meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const stripeApiKey = process.env.STRIPE_API_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeApiKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'STRIPE_API_KEY or STRIPE_WEBHOOK_SECRET not configured' },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeApiKey);
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: `signature: ${message}` }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    metadata.email;

  if (!email) {
    return NextResponse.json(
      { error: 'no email on checkout session' },
      { status: 400 }
    );
  }

  const eventId = metadata.event_id || session.id;
  const amountTotal = session.amount_total ?? 0;
  const currency = (session.currency ?? 'gbp').toUpperCase();
  const contentName =
    metadata.ticket_type ||
    metadata.content_name ||
    inferTicketName(amountTotal, currency);

  try {
    const result = await sendPurchaseEvent({
      eventId,
      email,
      value: amountTotal / 100,
      currency,
      contentName,
      eventSourceUrl:
        metadata.event_source_url ||
        session.success_url ||
        'https://developcoaching.co.uk/thank-you',
      fbc: metadata.fbc || undefined,
      fbp: metadata.fbp || undefined,
      clientUserAgent: metadata.client_user_agent || undefined,
      clientIpAddress: metadata.client_ip_address || undefined,
      eventTimeSeconds: event.created,
    });
    return NextResponse.json({ received: true, meta: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: 'POST Stripe checkout.session.completed events here. See SETUP.md.',
  });
}

function inferTicketName(amountMinor: number, currency: string): string {
  if (currency !== 'GBP') return 'Build & Scale Summit';
  if (amountMinor >= 39000) return 'Build & Scale Summit — VIP';
  if (amountMinor >= 19000) return 'Build & Scale Summit — Standard';
  return 'Build & Scale Summit';
}
