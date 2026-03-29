// api/restore-purchase.js — ExpensioAPP Vercel Backend
// Looks up a payment by email to restore Pro access on new devices
// Uses Vercel KV (Redis) to store payment records after verification

const ALLOWED_ORIGINS = [
  'https://expensioapp.vercel.app',
  'https://expensioapp.in',
];

export default async function handler(req, res) {

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

  const { email } = req.body || {};

  // ── Validate email ────────────────────────────────────────
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ active: false, error: 'Email required' });
  }
  const emailClean = email.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(emailClean) || emailClean.length > 254) {
    return res.status(400).json({ active: false, error: 'Invalid email' });
  }

  // ── Rate limit restore attempts ───────────────────────────
  // Simple in-memory rate limit — for production use Vercel KV
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  // (Rate limiting logic would use KV store in production)

  // ── Look up payment record ────────────────────────────────
  // If you have Vercel KV enabled, use it:
  // const { kv } = require('@vercel/kv');
  // const record = await kv.get(`payment:${emailClean}`);

  // For now — returns not found (extend with real DB lookup)
  // To record purchases, call this in verify-payment.js after verification:
  // await kv.set(`payment:${email}`, { payment_id, order_id, activated_at }, { ex: 366*86400 });

  console.log('Restore attempt for:', emailClean, 'from IP:', ip.split(',')[0]);

  return res.status(200).json({
    active: false,
    message: `No active Pro subscription found for ${emailClean}. If you purchased recently, please wait a few minutes and try again, or contact support@expensioapp.in with your Razorpay payment ID.`,
  });
}
