const products = require('../products.json');

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
    const { email, items } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart is empty.' });
      return;
    }

    // Total is computed here from products.json, never trusted from the browser.
    const total = items.reduce((sum, { id, quantity }) => {
      const p = products.find((x) => x.id === id);
      if (!p) throw new Error(`Unknown product id: ${id}`);
      const qty = Math.max(1, Math.min(20, Number(quantity) || 1));
      return sum + p.price * qty;
    }, 0);

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(total * 100), // Paystack amounts are in the smallest currency unit
        currency: 'KES',
        channels: ['card'],
        callback_url: `${origin}/`,
      }),
    });
    const psData = await psRes.json();

    if (!psData.status) {
      res.status(502).json({ error: psData.message || 'Paystack rejected the request.' });
      return;
    }

    res.status(200).json({ authorizationUrl: psData.data.authorization_url, reference: psData.data.reference });
  } catch (err) {
    console.error('Paystack initialize error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong starting checkout.' });
  }
};
