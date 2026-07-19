const { Redis } = require('@upstash/redis');
const redis = Redis.fromEnv();

module.exports = async (req, res) => {
  const reference = req.query.reference;
  if (!reference) {
    res.status(400).json({ error: 'Missing reference.' });
    return;
  }

  const cached = await redis.get(`paystack:${reference}`);
  if (cached && cached.status !== 'pending') {
    res.status(200).json(cached);
    return;
  }

  // Webhook may not have arrived yet — ask Paystack directly as a fallback.
  if (process.env.PAYSTACK_SECRET_KEY) {
    try {
      const psRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      const psData = await psRes.json();
      if (psData.status && psData.data) {
        const status = psData.data.status === 'success' ? 'success' : (psData.data.status === 'failed' ? 'failed' : 'pending');
        if (status !== 'pending') {
          await redis.set(`paystack:${reference}`, { status, gatewayResponse: psData.data.gateway_response }, { ex: 600 });
        }
        res.status(200).json({ status, gatewayResponse: psData.data.gateway_response });
        return;
      }
    } catch (err) {
      console.error('Verify fallback error:', err);
    }
  }

  res.status(200).json(cached || { status: 'pending' });
};
