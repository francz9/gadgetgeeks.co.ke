const { Redis } = require('@upstash/redis');
const products = require('../products.json');

const redis = Redis.fromEnv();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!process.env.PAYSTACK_SECRET_KEY) {
    res.status(500).json({ error: 'PAYSTACK_SECRET_KEY is not set. Add it in Vercel → Settings → Environment Variables.' });
    return;
  }

  try {
    const { email, phone, items } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (!phone || !/^254[17]\d{8}$/.test(phone)) {
      res.status(400).json({ error: 'Phone must be in the format 2547XXXXXXXX or 2541XXXXXXXX.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart is empty.' });
      return;
    }

    const total = items.reduce((sum, { id, quantity }) => {
      const p = products.find((x) => x.id === id);
      if (!p) throw new Error(`Unknown product id: ${id}`);
      const qty = Math.max(1, Math.min(20, Number(quantity) || 1));
      return sum + p.price * qty;
    }, 0);

    const psRes = await fetch('https://api.paystack.co/charge', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(total * 100),
        currency: 'KES',
        mobile_money: { phone, provider: 'mpesa' },
      }),
    });
    const psData = await psRes.json();

    if (!psData.status || !psData.data?.reference) {
      res.status(502).json({ error: psData.message || 'Paystack rejected the request.' });
      return;
    }

    const reference = psData.data.reference;
    // Payment completes asynchronously once the customer enters their PIN —
    // the webhook fills in the final status, this just marks it as started.
    await redis.set(`paystack:${reference}`, { status: 'pending' }, { ex: 600 });

    res.status(200).json({ reference });
  } catch (err) {
    console.error('Paystack mobile money charge error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong starting the M-Pesa payment.' });
  }
};
