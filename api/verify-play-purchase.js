// api/verify-play-purchase.js — ExpensioAPP Vercel Backend
// Verifies Google Play Billing purchases server-side using Google APIs

import { GoogleAuth } from 'google-auth-library';

const ALLOWED_ORIGINS = [
  'https://expensioapp.vercel.app',
  'https://expensioapp.in',
];

export default async function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { purchaseToken, productId, orderId } = req.body || {};

  // ── Validate inputs ──────────────────────────────────
  if (!purchaseToken || !productId) {
    return res.status(400).json({ verified: false, error: 'Missing purchaseToken or productId' });
  }

  const VALID_PRODUCTS = ['expensio_pro_annual', 'expensio_pro_monthly'];
  if (!VALID_PRODUCTS.includes(productId)) {
    return res.status(400).json({ verified: false, error: 'Unknown product ID' });
  }

  // ── Verify with Google Play Developer API ─────────────
  // Set these in Vercel → Settings → Environment Variables:
  //   GOOGLE_PLAY_PACKAGE_NAME   e.g. com.expensioapp.finance
  //   GOOGLE_SERVICE_ACCOUNT_KEY  paste entire service account JSON as one line
  //
  // HOW TO GET GOOGLE_SERVICE_ACCOUNT_KEY:
  // 1. Google Play Console → Setup → API access
  // 2. Link to a Google Cloud project
  // 3. Create Service Account with "Financial data viewer" role
  // 4. Download JSON key → paste entire JSON as env var value
  //
  const packageName   = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.expensioapp.finance';
  const serviceAccKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccKey) {
    // Fallback: trust the purchase token (less secure — for testing only)
    console.warn('GOOGLE_SERVICE_ACCOUNT_KEY not set — using token-trust fallback');
    if (purchaseToken && purchaseToken.length > 10) {
      console.log('Play purchase trusted (token-fallback):', { productId, orderId });
      return res.status(200).json({ verified: true, method: 'token-trust' });
    }
    return res.status(400).json({ verified: false, error: 'Cannot verify without service account key' });
  }

  try {
    // Use google-auth-library for proper JWT signing (fixes broken manual JWT)
    const keyData = JSON.parse(serviceAccKey);
    const auth = new GoogleAuth({
      credentials: keyData,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client      = await auth.getClient();
    const tokenRes    = await client.getAccessToken();
    const accessToken = tokenRes.token;
    if (!accessToken) throw new Error('Failed to get Google access token');

    // Call Play Developer API to verify subscription
    const apiUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
    const verifyRes  = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok) {
      console.error('Google Play API error:', verifyData);
      return res.status(400).json({ verified: false, error: verifyData.error?.message || 'Google verification failed' });
    }

    // paymentState: 1 = received, 0 = pending; no cancelReason = still active
    const isActive = verifyData.paymentState === 1 && !verifyData.cancelReason;

    if (isActive) {
      console.log('Play purchase verified:', { productId, orderId, expiryMs: verifyData.expiryTimeMillis });
      return res.status(200).json({
        verified:   true,
        expiryTime: verifyData.expiryTimeMillis,
        method:     'google-api',
      });
    } else {
      return res.status(400).json({ verified: false, error: 'Subscription not active', state: verifyData.paymentState });
    }

  } catch (e) {
    console.error('Play verification error:', e);
    return res.status(500).json({ verified: false, error: e.message });
  }
}
