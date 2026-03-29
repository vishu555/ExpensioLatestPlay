// api/health.js — ExpensioAPP health check endpoint
// Use to verify backend is live: GET https://yourapp.vercel.app/api/health

export default function handler(req, res) {
  res.status(200).json({
    status:    'ok',
    service:   'ExpensioAPP API',
    timestamp: new Date().toISOString(),
    env: {
      razorpay_key_id:     !!process.env.RAZORPAY_KEY_ID,
      razorpay_key_secret: !!process.env.RAZORPAY_KEY_SECRET,
      webhook_secret:      !!process.env.RAZORPAY_WEBHOOK_SECRET,
    },
  });
}
