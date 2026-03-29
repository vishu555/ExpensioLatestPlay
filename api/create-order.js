// api/create-order.js — ExpensioAPP Vercel Backend
// Creates a Razorpay order server-side so Key Secret never touches the browser

import Razorpay from 'razorpay';

const ALLOWED_ORIGINS = [
  'https://expensioapp.vercel.app',   // replace with your actual Vercel URL
  'https://expensioapp.in',           // replace with your custom domain
];

export default async function handler(req, res) {

  // ── CORS: only your own domain can call this ──────────────
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Validate env vars are set ─────────────────────────────
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('Razorpay env vars not set');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  // ── Create Razorpay instance with server-side secret ──────
  const rzp = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const order = await rzp.orders.create({
      amount:   39900,           // ₹399 in paise — always set server-side
      currency: 'INR',
      receipt:  `expensio_${Date.now()}`,
      notes: {
        product:  'Expensio Pro Annual',
        platform: 'PWA/Android',
      },
    });

    // Return only the order ID to client — secret never leaves server
    return res.status(200).json({ id: order.id, amount: order.amount, currency: order.currency });

  } catch (err) {
    console.error('Razorpay order creation error:', err);
    return res.status(500).json({ error: 'Could not create payment order. Please try again.' });
  }
}
