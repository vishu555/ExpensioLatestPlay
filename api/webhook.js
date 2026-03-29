// api/webhook.js — ExpensioAPP Vercel Backend
// Receives Razorpay webhooks for payment events
// This runs server-side even if the user closes their browser mid-payment
// Set this URL in Razorpay Dashboard → Webhooks → https://yourapp.vercel.app/api/webhook

import crypto from 'crypto';

// Razorpay sends raw body — disable body parsing for signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-razorpay-signature'];

  // ── Verify webhook signature ──────────────────────────────
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.error('RAZORPAY_WEBHOOK_SECRET not set');
    return res.status(500).end();
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (signature !== expected) {
    console.warn('Webhook signature mismatch — possible spoofed request');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // ── Parse and handle event ────────────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event.event;
  console.log('Razorpay webhook received:', eventType);

  switch (eventType) {

    case 'payment.captured': {
      // Payment successfully captured — record in your DB here
      const payment = event.payload?.payment?.entity || {};
      console.log('Payment captured:', {
        id:       payment.id,
        amount:   payment.amount,
        currency: payment.currency,
        email:    payment.email,
        order_id: payment.order_id,
      });
      // TODO: Save to Vercel KV / Supabase / Firebase
      // await kv.set(`payment:${payment.email}`, { payment_id: payment.id, order_id: payment.order_id, activated_at: Date.now() }, { ex: 366*86400 });
      break;
    }

    case 'payment.failed': {
      const payment = event.payload?.payment?.entity || {};
      console.warn('Payment failed:', {
        id:     payment.id,
        reason: payment.error_description,
        email:  payment.email,
      });
      break;
    }

    case 'subscription.charged':
    case 'subscription.activated': {
      console.log('Subscription event:', eventType, event.payload?.subscription?.entity?.id);
      break;
    }

    default:
      console.log('Unhandled webhook event:', eventType);
  }

  // Always return 200 quickly — Razorpay retries on failure
  return res.status(200).json({ received: true });
}
