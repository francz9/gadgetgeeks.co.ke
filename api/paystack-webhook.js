const crypto = require('crypto');
const { Redis } = require('@upstash/redis');
const redis = Redis.fromEnv();

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  try {
    const raw = await getRawBody(req);
    const signature = req.headers['x-paystack-signature'];
    const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '').update(raw).digest('hex');

    // This check is what stops anyone else from faking a "payment succeeded"
    // call to your site — only Paystack knows your secret key.
    if (!signature || signature !== expected) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = JSON.parse(raw);
    const reference = event.data?.reference;

    if (reference && (event.event === 'charge.success' || event.event === 'charge.failed')) {
      await redis.set(`paystack:${reference}`, {
        status: event.event === 'charge.success' ? 'success' : 'failed',
        gatewayResponse: event.data.gateway_response,
        amount: event.data.amount,
        channel: event.data.channel,
      }, { ex: 600 });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handling error:', err);
    res.status(200).json({ received: true }); // still 200 so Paystack doesn't retry-storm
  }
}

// Signature verification needs the exact raw request bytes, so the
// automatic JSON body parser has to be turned off for this endpoint.
handler.config = { api: { bodyParser: false } };

module.exports = handler;
