const { supabase } = require('../services/supabase');
const { logError } = require('../services/errorLogger');

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

  // ── Analytics overview ─────────────────────────────────────────────────────
  fastify.get('/analytics/overview', adminAuth, async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const [
      { count: totalMessages },
      { count: messagesToday },
      { count: activeWorkspaces },
      { data: activeSubs },
      { data: wsTypes },
      { data: msgCounts30d },
      { data: topWs },
      { data: { users }, error: usersErr },
    ] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStr),
      supabase.from('workspaces').select('id', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
      supabase.from('subscriptions').select('amount').eq('status', 'active'),
      supabase.from('workspaces').select('business_type').is('deleted_at', null),
      supabase.rpc('get_daily_message_counts'),
      supabase.rpc('admin_top_workspaces'),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    if (usersErr) console.error('Admin list users error:', usersErr?.message);

    const emailMap = Object.fromEntries((users || []).map((u) => [u.id, u.email]));

    // Build 30-day date scaffold (always 30 entries even with no data)
    const now = new Date();
    const scaffold = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      scaffold[`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = 0;
    }
    const msgMap = { ...scaffold };
    for (const r of (msgCounts30d || [])) msgMap[r.date] = Number(r.cnt);
    const messages_last_30_days = Object.entries(msgMap).map(([date, count]) => ({ date, count }));

    // New users last 30 days
    const userMap = { ...scaffold };
    for (const u of (users || [])) {
      if (new Date(u.created_at) >= new Date(d30)) {
        const d = new Date(u.created_at);
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (key in userMap) userMap[key]++;
      }
    }
    const new_users_last_30_days = Object.entries(userMap).map(([date, count]) => ({ date, count }));

    // Business type breakdown
    const typeMap = {};
    for (const ws of (wsTypes || [])) {
      const t = ws.business_type || 'other';
      typeMap[t] = (typeMap[t] || 0) + 1;
    }
    const business_type_breakdown = Object.entries(typeMap).map(([type, count]) => ({ type, count }));

    return {
      total_users:             users?.length ?? 0,
      active_workspaces:       activeWorkspaces ?? 0,
      total_messages:          totalMessages ?? 0,
      monthly_revenue:         (activeSubs || []).reduce((s, r) => s + (r.amount || 0), 0),
      new_users_today:         (users || []).filter((u) => u.created_at?.startsWith(todayStr)).length,
      messages_today:          messagesToday ?? 0,
      new_users_last_30_days,
      messages_last_30_days,
      business_type_breakdown,
      top_workspaces: (topWs || []).map((w) => ({
        id:           w.id,
        name:         w.name,
        message_count: Number(w.message_count),
        owner_email:  emailMap[w.owner_id] ?? '—',
      })),
    };
  });

  // ── All workspaces (enriched) ───────────────────────────────────────────────
  fastify.get('/workspaces', adminAuth, async () => {
    const [
      { data: workspaces },
      { data: subs },
      { data: contactCounts },
      { data: msgCounts },
      { data: lastMsgTimes },
      { data: { users }, error: usersError },
    ] = await Promise.all([
      supabase.from('workspaces').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
      supabase.from('subscriptions').select('workspace_id, plan, status, trial_ends_at'),
      supabase.rpc('get_contact_counts'),
      supabase.rpc('get_message_counts'),
      supabase.rpc('get_last_message_times'),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);

    if (usersError) console.error('Admin list users error:', usersError.message);

    const emailMap   = Object.fromEntries((users || []).map((u) => [u.id, u.email]));
    const subMap     = Object.fromEntries((subs || []).map((s) => [s.workspace_id, s]));
    const countMap   = Object.fromEntries((contactCounts || []).map((c) => [c.workspace_id, Number(c.contact_count)]));
    const msgMap     = Object.fromEntries((msgCounts || []).map((c) => [c.workspace_id, Number(c.message_count)]));
    const lastMsgMap = Object.fromEntries((lastMsgTimes || []).map((c) => [c.workspace_id, c.last_at]));

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
      message_count:      msgMap[ws.id] ?? 0,
      last_active:        lastMsgMap[ws.id] ?? null,
      subscription:       subMap[ws.id] ?? null,
    }));
  });

  // ── Workspace detail drawer ─────────────────────────────────────────────────
  fastify.get('/workspaces/:id/details', adminAuth, async (req, reply) => {
    const { id } = req.params;
    const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*').eq('id', id).single();
    if (wsErr || !ws) return reply.code(404).send({ error: 'Not found' });

    const [
      { count: msgCount },
      { count: contactCount },
      { count: flowCount },
      { count: broadcastCount },
      { data: recentMsgs },
      { data: sub },
      { data: { user } },
    ] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
      supabase.from('flows').select('id', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
      supabase.from('broadcasts').select('id', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
      supabase.from('messages').select('body, direction, created_at').eq('workspace_id', id).order('created_at', { ascending: false }).limit(5),
      supabase.from('subscriptions').select('*').eq('workspace_id', id).maybeSingle(),
      supabase.auth.admin.getUserById(ws.user_id),
    ]);

    return {
      workspace: {
        id: ws.id, name: ws.name, business_type: ws.business_type,
        is_active: ws.is_active, created_at: ws.created_at,
        phone_number: ws.phone_number, upi_id: ws.upi_id,
        deactivated_reason: ws.deactivated_reason, deactivated_at: ws.deactivated_at,
        phone_number_id: ws.phone_number_id ? '••• connected' : null,
      },
      owner:          { email: user?.email ?? '—', created_at: user?.created_at ?? null },
      stats:          { messages: msgCount ?? 0, contacts: contactCount ?? 0, flows: flowCount ?? 0, broadcasts: broadcastCount ?? 0 },
      recent_messages: recentMsgs ?? [],
      subscription:    sub,
    };
  });

  // ── Error logs ──────────────────────────────────────────────────────────────
  fastify.get('/error-logs', adminAuth, async () => {
    const { data } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  });

  // ── System health — all services ───────────────────────────────────────────
  fastify.get('/system-health', adminAuth, async () => {
    const services = ['railway_backend', 'supabase', 'groq', 'resend', 'whatsapp_api'];
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [latestChecksArr, errorLogsRes, errorCountsRes, webhooksTodayRes] = await Promise.all([
      // Latest check per service
      Promise.all(services.map((svc) =>
        supabase.from('service_checks').select('*').eq('service', svc)
          .order('checked_at', { ascending: false }).limit(1)
          .then(({ data }) => data?.[0] ?? { service: svc, status: 'unknown' })
      )),
      supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('error_logs').select('source, severity').gte('created_at', yesterday),
      supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', today).eq('direction', 'inbound'),
    ]);

    const latestChecks = Object.fromEntries(latestChecksArr.map((c) => [c.service, c]));

    const countBySource = {};
    for (const e of (errorCountsRes.data || [])) {
      countBySource[e.source] = (countBySource[e.source] || 0) + 1;
    }

    return {
      services:          latestChecks,
      error_logs:        errorLogsRes.data  ?? [],
      error_counts_24h:  countBySource,
      webhooks_today:    webhooksTodayRes.count ?? 0,
      uptime_seconds:    Math.floor(process.uptime()),
    };
  });

  // POST /admin/system-health/refresh — trigger immediate check
  fastify.post('/system-health/refresh', adminAuth, async () => {
    const { checkAllServices } = require('../services/healthChecker');
    const results = await checkAllServices();
    return results;
  });

  // DELETE /admin/error-logs/old — purge logs older than 7 days
  fastify.delete('/error-logs/old', adminAuth, async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('error_logs').delete().lt('created_at', cutoff);
    if (error) return { success: false, error: error.message };
    return { success: true };
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
