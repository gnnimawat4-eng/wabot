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

  // All workspaces — enriched with owner email, contact count, subscription + is_active status
  fastify.get('/workspaces', adminAuth, async () => {
    const [
      { data: workspaces },
      { data: subs },
      { data: contactCounts },
      { data: { users }, error: usersError },
    ] = await Promise.all([
      supabase.from('workspaces').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
      supabase.from('subscriptions').select('workspace_id, plan, status, trial_ends_at'),
      supabase.rpc('get_contact_counts'),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    if (usersError) console.error('Admin list users error:', usersError.message);

    const emailMap = Object.fromEntries((users || []).map((u) => [u.id, u.email]));
    const subMap   = Object.fromEntries((subs || []).map((s) => [s.workspace_id, s]));
    const countMap = Object.fromEntries((contactCounts || []).map((c) => [c.workspace_id, Number(c.contact_count)]));

    return (workspaces || []).map((ws) => ({
      id:                 ws.id,
      name:               ws.name,
      business_type:      ws.business_type ?? null,
      is_active:          ws.is_active ?? true,
      deactivated_at:     ws.deactivated_at ?? null,
      deactivated_reason: ws.deactivated_reason ?? null,
      created_at:         ws.created_at,
      owner_email:        emailMap[ws.user_id] ?? '—',
      contact_count:      countMap[ws.id] ?? 0,
      subscription:       subMap[ws.id] ?? null,
    }));
  });

  // Toggle workspace active/suspended status
  fastify.patch('/workspaces/:id/toggle', adminAuth, async (req, reply) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: ws, error } = await supabase
      .from('workspaces')
      .select('id, name, is_active')
      .eq('id', id)
      .single();

    if (error || !ws) return reply.code(404).send({ error: 'Workspace not found' });

    const newStatus = !(ws.is_active ?? true);
    const { error: updateErr } = await supabase
      .from('workspaces')
      .update({
        is_active:          newStatus,
        deactivated_at:     newStatus ? null : new Date().toISOString(),
        deactivated_reason: newStatus ? null : (reason?.trim() || 'Suspended by admin'),
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Toggle workspace error:', updateErr.message);
      return reply.code(500).send({ error: updateErr.message });
    }

    return {
      success:   true,
      is_active: newStatus,
      message:   newStatus ? 'Workspace activated' : 'Workspace suspended',
    };
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
