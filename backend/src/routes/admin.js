const { supabase } = require('../services/supabase');

const ADMIN_EMAIL = 'gnnimawat4@gmail.com';

module.exports = async function adminRoutes(fastify) {
  const adminAuth = {
    onRequest: [
      fastify.authenticate,
      async (req, reply) => {
        if (req.user?.email !== ADMIN_EMAIL) {
          return reply.code(403).send({ error: 'Access denied' });
        }
      },
    ],
  };

  // Overview stats
  fastify.get('/overview', adminAuth, async () => {
    const month = new Date().toISOString().slice(0, 7);
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const [
      { count: totalWorkspaces },
      { count: activeSubscriptions },
      { count: trialUsers },
      { count: messagesToday },
      { data: activeSubs },
    ] = await Promise.all([
      supabase.from('workspaces').select('id', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'trial'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
      supabase.from('subscriptions').select('amount').eq('status', 'active'),
    ]);

    const mrr = (activeSubs || []).reduce((s, r) => s + (r.amount || 0), 0);
    return { totalWorkspaces, activeSubscriptions, trialUsers, messagesToday, mrr };
  });

  // All customers
  fastify.get('/customers', adminAuth, async () => {
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name, business_type, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('workspace_id, plan, status, amount, trial_ends_at, current_period_end');

    const subMap = Object.fromEntries((subs || []).map((s) => [s.workspace_id, s]));
    return (workspaces || []).map((ws) => ({ ...ws, subscription: subMap[ws.id] ?? null }));
  });

  // Revenue list
  fastify.get('/revenue', adminAuth, async () => {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .not('razorpay_payment_id', 'is', null)
      .order('current_period_start', { ascending: false })
      .limit(200);
    return data ?? [];
  });

  // Recent WhatsApp error messages (failed outbound)
  fastify.get('/errors', adminAuth, async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, workspace_id, body, status, created_at')
      .eq('direction', 'outbound')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(100);
    return data ?? [];
  });
};
