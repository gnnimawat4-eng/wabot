const crypto = require('crypto');
const Razorpay = require('razorpay');
const { supabase } = require('../services/supabase');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLANS = {
  starter: process.env.RAZORPAY_PLAN_STARTER,
  growth: process.env.RAZORPAY_PLAN_GROWTH,
  agency: process.env.RAZORPAY_PLAN_AGENCY,
};

module.exports = async function billingRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.post('/subscribe', auth, async (req, reply) => {
    const { plan, workspaceId } = req.body;
    const planId = PLANS[plan];
    if (!planId) return reply.code(400).send({ error: 'Invalid plan' });

    const userId = req.user.sub;
    const { data: profile } = await supabase.from('profiles').select('email, name').eq('id', userId).single();

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: 12,
      customer_notify: 1,
      notes: { workspaceId, userId },
    });

    await supabase.from('subscriptions').upsert({
      workspace_id: workspaceId,
      user_id: userId,
      razorpay_subscription_id: subscription.id,
      plan,
      status: 'created',
    }, { onConflict: 'workspace_id' });

    return { subscriptionId: subscription.id, shortUrl: subscription.short_url };
  });

  fastify.get('/subscription/:workspaceId', auth, async (req) => {
    const { workspaceId } = req.params;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single();
    if (error) return { plan: null, status: 'none' };
    return data;
  });

  // Razorpay webhook
  fastify.post('/webhook', async (req, reply) => {
    const sig = req.headers['x-razorpay-signature'];
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (sig !== expected) return reply.code(401).send('Invalid signature');

    const { event, payload } = req.body;
    const sub = payload?.subscription?.entity;

    if (!sub) return reply.send('ok');

    const statusMap = {
      'subscription.activated': 'active',
      'subscription.charged': 'active',
      'subscription.halted': 'halted',
      'subscription.cancelled': 'cancelled',
      'subscription.completed': 'completed',
    };

    if (statusMap[event]) {
      await supabase
        .from('subscriptions')
        .update({ status: statusMap[event], updated_at: new Date().toISOString() })
        .eq('razorpay_subscription_id', sub.id);
    }

    return reply.send('ok');
  });
};
