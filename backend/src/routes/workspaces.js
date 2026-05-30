const { supabase } = require('../services/supabase');

// Maps live DB column names → frontend field names
const toWorkspace = (row) => ({
  id: row.id,
  name: row.name,
  owner_id: row.user_id,
  wa_phone_number_id: row.phone_number_id ?? null,
  wa_phone_number: row.phone_number ?? null,
  wa_access_token: row.access_token ?? null,
  wa_business_id: row.waba_id ?? null,
  ai_system_prompt: row.ai_system_prompt ?? null,
  business_type: row.business_type ?? null,
  onboarding_completed: row.onboarding_completed ?? false,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Maps frontend field names → live DB column names (for PATCH body)
const FIELD_MAP = {
  name: 'name',
  wa_phone_number_id: 'phone_number_id',
  wa_phone_number: 'phone_number',
  wa_access_token: 'access_token',
  wa_business_id: 'waba_id',
  ai_system_prompt: 'ai_system_prompt',
  business_type: 'business_type',
  onboarding_completed: 'onboarding_completed',
};

const toDb = (body) =>
  Object.fromEntries(
    Object.entries(body)
      .filter(([k]) => FIELD_MAP[k] !== undefined)
      .map(([k, v]) => [FIELD_MAP[k], v])
  );

module.exports = async function workspaceRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── List workspaces (exclude soft-deleted) ──────────────────────────────
  fastify.get('/', auth, async (req) => {
    const userId = req.user.sub;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw error;
    return (data || []).map(toWorkspace);
  });

  fastify.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const { name } = req.body || {};
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name, user_id: userId })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('subscriptions').insert({
      workspace_id: data.id,
      user_id: userId,
      plan: 'trial',
      status: 'trial',
      amount: 0,
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).catch((e) => console.error('Trial subscription error:', e.message));

    return reply.code(201).send(toWorkspace(data));
  });

  fastify.get('/:id', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return toWorkspace(data);
  });

  fastify.patch('/:id', auth, async (req) => {
    const { id } = req.params;
    const updates = toDb(req.body || {});
    if (Object.keys(updates).length === 0) {
      return { error: 'No valid fields to update' };
    }
    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toWorkspace(data);
  });

  // ── Soft delete workspace ───────────────────────────────────────────────
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = req.params;
    const userId = req.user.sub;
    const { error } = await supabase
      .from('workspaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // ── Trash: get all deleted items for this workspace ─────────────────────
  fastify.get('/:id/trash', auth, async (req) => {
    const { id } = req.params;
    const userId = req.user.sub;

    const [contacts, flows, broadcasts, workspaces] = await Promise.all([
      supabase.from('contacts').select('id, name, phone, deleted_at').eq('workspace_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('flows').select('id, name, deleted_at').eq('workspace_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('broadcasts').select('id, name, deleted_at').eq('workspace_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('workspaces').select('id, name, deleted_at').eq('user_id', userId).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ]);

    return {
      contacts:   contacts.data   || [],
      flows:      flows.data      || [],
      broadcasts: broadcasts.data || [],
      workspaces: workspaces.data || [],
    };
  });

  // ── Trash: restore an item ──────────────────────────────────────────────
  fastify.patch('/:id/trash/restore/:type/:itemId', auth, async (req, reply) => {
    const { type, itemId } = req.params;
    const tables = { contacts: 'contacts', flows: 'flows', broadcasts: 'broadcasts', workspaces: 'workspaces' };
    const table = tables[type];
    if (!table) return reply.code(400).send({ error: 'Invalid type' });

    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', itemId);
    if (error) throw error;
    return reply.code(200).send({ ok: true });
  });

  // ── Trash: permanently delete an item ──────────────────────────────────
  fastify.delete('/:id/trash/permanent/:type/:itemId', auth, async (req, reply) => {
    const { type, itemId } = req.params;
    const tables = { contacts: 'contacts', flows: 'flows', broadcasts: 'broadcasts', workspaces: 'workspaces' };
    const table = tables[type];
    if (!table) return reply.code(400).send({ error: 'Invalid type' });

    const { error } = await supabase.from(table).delete().eq('id', itemId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // ── Locations (tables / rooms) ──────────────────────────────────────────
  fastify.get('/:id/locations', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('location_qr')
      .select('*')
      .eq('workspace_id', id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  });

  fastify.post('/:id/locations', auth, async (req, reply) => {
    const { id } = req.params;
    const { name, location_type } = req.body || {};
    if (!name || !location_type) return reply.code(400).send({ error: 'name and location_type are required' });

    const { data, error } = await supabase
      .from('location_qr')
      .insert({ workspace_id: id, name, location_type })
      .select()
      .single();
    if (error) throw error;
    return reply.code(201).send(data);
  });

  fastify.patch('/:id/locations/:locationId', auth, async (req, reply) => {
    const { id, locationId } = req.params;
    const { name } = req.body || {};
    if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });

    const { data, error } = await supabase
      .from('location_qr')
      .update({ name: name.trim() })
      .eq('id', locationId)
      .eq('workspace_id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  fastify.delete('/:id/locations/:locationId', auth, async (req, reply) => {
    const { id, locationId } = req.params;
    const { error } = await supabase
      .from('location_qr')
      .delete()
      .eq('id', locationId)
      .eq('workspace_id', id);
    if (error) throw error;
    return reply.code(204).send();
  });

  // ── Smart Menu (smart_menus table) ──────────────────────────────────────
  fastify.get('/:id/smart-menu', auth, async (req) => {
    const { id } = req.params;
    const { data } = await supabase
      .from('smart_menus').select('*').eq('workspace_id', id).maybeSingle();
    return data || null;
  });

  // Create or update — explicit check avoids needing a UNIQUE constraint for upsert
  fastify.post('/:id/smart-menu', auth, async (req, reply) => {
    const { id } = req.params;
    const { business_name, languages, options } = req.body || {};
    if (!business_name?.trim()) return reply.code(400).send({ error: 'business_name is required' });

    try {
      const payload = {
        workspace_id:  id,
        business_name: business_name.trim(),
        languages:     languages || ['english', 'hindi', 'hinglish'],
        options:       options   || [],
        is_active:     true,
        updated_at:    new Date().toISOString(),
      };

      // Check if a record already exists for this workspace
      const { data: existing } = await supabase
        .from('smart_menus').select('id').eq('workspace_id', id).maybeSingle();

      let data, error;
      if (existing?.id) {
        ({ data, error } = await supabase
          .from('smart_menus').update(payload).eq('workspace_id', id).select().single());
      } else {
        ({ data, error } = await supabase
          .from('smart_menus').insert(payload).select().single());
      }

      if (error) {
        console.error('Smart menu save error:', JSON.stringify(error));
        return reply.code(500).send({ error: error.message || 'Failed to save smart menu' });
      }
      return reply.code(201).send(data);
    } catch (err) {
      console.error('Smart menu save exception:', err?.message);
      return reply.code(500).send({ error: err?.message || 'Failed to save smart menu' });
    }
  });

  // Partial update (e.g. one option reply edited inline)
  fastify.patch('/:id/smart-menu', auth, async (req, reply) => {
    const { id } = req.params;
    try {
      const body = req.body || {};
      const allowed = ['business_name', 'languages', 'options', 'is_active'];
      const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('smart_menus').update(updates).eq('workspace_id', id).select().single();
      if (error) {
        console.error('Smart menu patch error:', JSON.stringify(error));
        return reply.code(500).send({ error: error.message || 'Failed to update smart menu' });
      }
      return data;
    } catch (err) {
      console.error('Smart menu patch exception:', err?.message);
      return reply.code(500).send({ error: err?.message || 'Failed to update smart menu' });
    }
  });

  fastify.delete('/:id/smart-menu', auth, async (req, reply) => {
    const { id } = req.params;
    await supabase.from('smart_menus').delete().eq('workspace_id', id);
    return reply.code(204).send();
  });

  // ── Analytics (full dashboard data) ────────────────────────────────────
  fastify.get('/:id/analytics', auth, async (req) => {
    const { id } = req.params;

    const now = new Date();
    const som  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const solm = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const d30  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      mThisM, mLastM,
      arThisM, arLastM,
      allContacts,
      frThisM, frLastM,
      msgs30d,
      recent,
      runs30d,
    ] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('created_at', som),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('created_at', solm).lt('created_at', som),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).eq('direction', 'outbound').gte('created_at', som),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).eq('direction', 'outbound').gte('created_at', solm).lt('created_at', som),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
      supabase.from('flow_runs').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('started_at', som),
      supabase.from('flow_runs').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('started_at', solm).lt('started_at', som),
      supabase.from('messages').select('created_at').eq('workspace_id', id).gte('created_at', d30).order('created_at'),
      supabase.from('messages').select('body, direction, created_at, contacts(name, phone)').eq('workspace_id', id).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(10),
      supabase.from('flow_runs').select('flow_id, flows(name)').eq('workspace_id', id).gte('started_at', d30),
    ]);

    // Messages over time — fill all 30 days so chart has no gaps
    const dayMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      dayMap[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
    }
    for (const m of msgs30d.data || []) {
      const d = new Date(m.created_at);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      if (k in dayMap) dayMap[k]++;
    }
    const messages_over_time = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

    // Peak hours
    const hourMap = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const m of msgs30d.data || []) {
      hourMap[new Date(m.created_at).getHours()].count++;
    }

    // Top flows
    const flowCount = {};
    const flowName  = {};
    for (const r of runs30d.data || []) {
      if (!r.flow_id) continue;
      flowCount[r.flow_id] = (flowCount[r.flow_id] || 0) + 1;
      if (r.flows?.name) flowName[r.flow_id] = r.flows.name;
    }
    const top_flows = Object.entries(flowCount)
      .map(([fid, count]) => ({ name: flowName[fid] || 'Unnamed', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const pct = (curr, prev) => {
      const c = curr || 0, p = prev || 0;
      return p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
    };

    return {
      stats: {
        messages_this_month:   mThisM.count  || 0,
        messages_pct:          pct(mThisM.count,  mLastM.count),
        auto_replies_this_month: arThisM.count || 0,
        auto_replies_pct:      pct(arThisM.count, arLastM.count),
        active_contacts:       allContacts.count || 0,
        flows_triggered:       frThisM.count || 0,
        flows_triggered_pct:   pct(frThisM.count, frLastM.count),
      },
      messages_over_time,
      top_flows,
      peak_hours: hourMap,
      recent_activity: (recent.data || []).map((m) => ({
        body:          m.body,
        direction:     m.direction,
        created_at:    m.created_at,
        contact_name:  m.contacts?.name  || 'Unknown',
        contact_phone: m.contacts?.phone || '',
      })),
    };
  });

  fastify.get('/:id/stats', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase.rpc('get_workspace_stats', { ws_id: id });
    if (error) {
      const [contacts, messages, flows] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
        supabase.from('flows').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('is_active', true).is('deleted_at', null),
      ]);
      return {
        total_contacts: contacts.count || 0,
        total_messages: messages.count || 0,
        active_flows: flows.count || 0,
      };
    }
    return data;
  });
};
