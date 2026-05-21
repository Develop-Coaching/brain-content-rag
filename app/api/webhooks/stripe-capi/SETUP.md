# Stripe → Meta CAPI bridge — setup

Server-side Conversions API event for every Stripe Summit purchase. Recovers
the ~30% of Purchase events that iOS 14.5+ / Safari ITP / ad blockers strip
from the browser pixel. Meta dedupes against the browser pixel using a
shared `event_id`.

- Route: `POST /api/webhooks/stripe-capi`
- Code: `app/api/webhooks/stripe-capi/route.ts`
- CAPI client: `src/capi/meta.ts`

## 1. Env vars

Add to `.env` / hosting provider:

```
META_PIXEL_ID=260128381862353
META_CAPI_ACCESS_TOKEN=...        # Meta Events Manager → Settings → Conversions API → Generate access token
STRIPE_API_KEY=sk_live_...        # or sk_test_... for staging
STRIPE_WEBHOOK_SECRET=whsec_...   # from the Stripe webhook endpoint you create in step 3
META_TEST_EVENT_CODE=             # optional, only set while testing in Meta's Test Events tab
```

`META_TEST_EVENT_CODE` is grabbed from Events Manager → Test Events → "Test
server events" panel. Leave it unset in production — Meta drops events sent
with a stale test code.

## 2. Pass dedupe data through Stripe checkout

The browser Purchase pixel on the thank-you page already generates an
`event_id`. Both events need to carry the same one or Meta won't dedupe.

For each Stripe payment link (£197 Standard and £390 VIP), edit the link in
Stripe Dashboard → Payment Links → … → "More options" and turn on:

- Collect customer email (required)
- Custom fields → none needed
- **Metadata** → set the following keys (Stripe will prompt for values at
  checkout, but for dedupe we pass them via URL params from the landing page,
  see below):
  - `event_id`
  - `ticket_type` (`Standard` or `VIP`)
  - `fbc`
  - `fbp`
  - `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`
  - `event_source_url`

Payment links accept metadata via URL query string using the
`?prefilled_<key>` pattern is **not** supported for metadata — instead,
use the [client-reference-id pattern](https://docs.stripe.com/payments/payment-links/url-parameters)
or move to Stripe Checkout Sessions created in code.

The simplest path that works today: on the landing page, when the user
clicks the Buy button, intercept the click, generate the `event_id` UUID,
read `_fbp` / `_fbc` cookies, and append them to the payment link as
`client_reference_id` (a single string Stripe supports on payment links).
Pack all the fields into one JSON-encoded string:

```js
// in the landing page CTA handler
const eventId = crypto.randomUUID();
const ref = btoa(JSON.stringify({
  event_id: eventId,
  fbc: getCookie('_fbc'),
  fbp: getCookie('_fbp'),
  utm_source: new URLSearchParams(location.search).get('utm_source'),
  utm_medium: new URLSearchParams(location.search).get('utm_medium'),
  utm_campaign: new URLSearchParams(location.search).get('utm_campaign'),
  utm_content: new URLSearchParams(location.search).get('utm_content'),
  ticket_type: 'Standard',
  event_source_url: 'https://developcoaching.co.uk/thank-you',
}));
window.location.href = `https://buy.stripe.com/<link-id>?client_reference_id=${ref}`;
// Also fire the browser pixel Purchase event with the same eventId on the
// thank-you page (Tab 1 already sets this up).
```

Then in this webhook, the route reads `session.client_reference_id`,
base64-decodes it, and uses it as metadata. **TODO before launch:** swap
the route's `metadata` reads to `JSON.parse(atob(session.client_reference_id))`
or migrate Stripe payment links to dynamic Checkout Sessions where metadata
is a first-class object.

If you go the Checkout Sessions route instead (cleaner), create the session
server-side with:

```js
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: 'price_xxx', quantity: 1 }],
  customer_email: email,
  success_url: 'https://developcoaching.co.uk/thank-you?sid={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://developcoaching.co.uk/summit',
  metadata: {
    event_id, fbc, fbp, ticket_type,
    utm_source, utm_medium, utm_campaign, utm_content,
    event_source_url: 'https://developcoaching.co.uk/thank-you',
  },
});
```

The route as written already reads from `session.metadata` so this just
works.

## 3. Register the webhook in Stripe

Stripe Dashboard → Developers → Webhooks → "Add endpoint":

- Endpoint URL: `https://<greg-brain-host>/api/webhooks/stripe-capi`
- Description: `Meta CAPI bridge`
- API version: latest
- Events to send: `checkout.session.completed` (only this one)
- Click "Reveal" on the signing secret and paste it into
  `STRIPE_WEBHOOK_SECRET`

## 4. Test locally

```
# In one terminal
npm run dev   # Greg Brain on :3000

# In another terminal — needs Stripe CLI installed (`brew install stripe/stripe-cli/stripe`)
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe-capi
# Stripe CLI prints a temporary signing secret — paste it into
# STRIPE_WEBHOOK_SECRET in your .env and restart the dev server.

# In a third terminal, fire a test event
stripe trigger checkout.session.completed
```

Expected: dev server logs `200` for the POST, response body
`{ "received": true, "meta": { ... } }`. If you set `META_TEST_EVENT_CODE`,
the event lands in Meta Events Manager → Test Events within ~30 seconds.

## 5. Verify dedupe in production

1. Open Meta Events Manager → Data Sources → pick the pixel (ID
   `260128381862353`) → Overview tab.
2. Make a real test purchase using the landing page CTA (use a £1 test
   product or refund yourself afterwards).
3. Within ~5 minutes the Purchase event should appear with **two sources**
   (Browser + Server) and a **"Deduplicated"** badge. If you see two
   un-deduped Purchase rows, the `event_id` isn't being passed through —
   check that the value in Stripe metadata matches the one fired by the
   browser pixel on the thank-you page.

## Definition of done

- [ ] `stripe trigger checkout.session.completed` returns 200 from the route
- [ ] A real test purchase shows up in Meta Test Events as Purchase with
      the correct value, currency=GBP, and content_name
- [ ] In Events Manager → Overview, the Purchase event shows the
      "Deduplicated" badge
- [ ] All four env vars set in production
