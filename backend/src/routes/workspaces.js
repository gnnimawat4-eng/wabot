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
