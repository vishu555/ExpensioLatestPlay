// api/verify-payment.js — ExpensioAPP Vercel Backend
// Verifies Razorpay payment signature server-side using HMAC-SHA256
// This is the CRITICAL security step — prevents fake payment activation

import crypto from 'crypto';

const ALLOWED_ORIGINS = [
  'https://expensio-latest-play-kwsn.vercel.app',
  'https://expensioapp.in',
];

export default function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────────
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  // ── Validate all required fields are present ──────────────
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: 'Missing payment fields' });
  }

  // ── Validate format to avoid timing attacks ───────────────
  const idPattern = /^[a-zA-Z0-9_-]{10,100}$/;
  if (!idPattern.test(razorpay_order_id) ||
      !idPattern.test(razorpay_payment_id) ||
      !/^[a-f0-9]{64}$/.test(razorpay_signature)) {
    return res.status(400).json({ verified: false, error: 'Invalid field format' });
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    console.error('RAZORPAY_KEY_SECRET not set');
    return res.status(500).json({ verified: false, error: 'Server configuration error' });
  }

  // ── HMAC-SHA256 signature verification ───────────────────
  // Razorpay signs: order_id + "|" + payment_id with your Key Secret
  const body     = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const sigBuffer      = Buffer.from(razorpay_signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  let verified = false;
  if (sigBuffer.length === expectedBuffer.length) {
    verified = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  if (!verified) {
    console.warn('Payment signature verification FAILED', {
      order_id:   razorpay_order_id,
      payment_id: razorpay_payment_id,
      // Never log the actual signature
    });
    return res.status(400).json({ verified: false, error: 'Payment verification failed' });
  }

  // ── Payment verified — log for audit trail ────────────────
  console.log('Payment verified:', {
    order_id:   razorpay_order_id,
    payment_id: razorpay_payment_id,
    timestamp:  new Date().toISOString(),
  });

  return res.status(200).json({ verified: true });
}
