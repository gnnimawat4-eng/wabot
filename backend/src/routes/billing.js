const crypto = require('crypto');
const { supabase } = require('../services/supabase');

const PLANS = {
  starter: { amount: 99900,  name: 'Starter', conversations: 500  },
  growth:  { amount: 249900, name: 'Growth',  conversations: 2000 },
  agency:  { amount: 699900, name: 'Agency',  conversations: -1   }, // unlimited
};

let razorpay = null;
try {
  const Razorpay = require('razorpay');
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id:    process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
} catch {}

module.exports = async function billingRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // Create Razorpay order
  fastify.post('/create-order', auth, async (req, reply) => {
    const { plan, workspaceId } = req.body;
    if (!PLANS[plan]) return reply.code(400).send({ error: 'Invalid plan' });
    if (!razorpay) return reply.code(503).send({ error: 'Payment gateway not configured' });

    const { amount } = PLANS[plan];
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `${workspaceId}-${Date.now()}`,
      notes: { workspaceId, plan, userId: req.user.sub },
    });

    await supabase.from('subscriptions').upsert({
      workspace_id: workspaceId,
      user_id: req.user.sub,
      plan,
      status: 'pending_payment',
      amount: Math.round(amount / 100),
      razorpay_order_id: order.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });

    return { orderId: order.id, amount, currency: 'INR', key: process.env.RAZORPAY_KEY_ID };
  });

  // Get subscription + conversation usage for workspace
  fastify.get('/subscription/:workspaceId', auth, async (req) => {
    const { workspaceId } = req.params;
    const [{ data: sub }, { data: cc }] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('workspace_id', workspaceId).maybeSingle(),
      supabase.from('conversation_counts')
        .select('count').eq('workspace_id', workspaceId)
        .eq('month', new Date().toISOString().slice(0, 7)).maybeSingle(),
    ]);

    const plan  = sub?.plan ?? 'trial';
    const limit = plan === 'trial' ? 100 : (PLANS[plan]?.conversations ?? null);

    return { ...(sub ?? { plan: 'trial', status: 'trial' }), conversation_count: cc?.count ?? 0, conversation_limit: limit };
  });

  // Razorpay payment webhook — public
  fastify.post('/razorpay-webhook', { onRequest: [] }, async (req, reply) => {
    const sig = req.headers['x-razorpay-signature'];
    if (sig && process.env.RAZORPAY_WEBHOOK_SECRET) {
      const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body)).digest('hex');
      if (sig !== expected) return reply.code(401).send('Invalid signature');
    }

    const { event, payload } = req.body || {};
    if (event === 'payment.captured') {
      const payment = payload?.payment?.entity;
      if (payment?.order_id) {
        const now = new Date();
        const end = new Date(now); end.setMonth(end.getMonth() + 1);
        await supabase.from('subscriptions').update({
          status: 'active',
          razorpay_payment_id: payment.id,
          current_period_start: now.toISOString(),
          current_period_end: end.toISOString(),
          updated_at: now.toISOString(),
        }).eq('razorpay_order_id', payment.order_id);
      }
    }
    return reply.send('ok');
  });
};
