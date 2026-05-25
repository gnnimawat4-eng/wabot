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
};

const toDb = (body) =>
  Object.fromEntries(
    Object.entries(body)
      .filter(([k]) => FIELD_MAP[k] !== undefined)
      .map(([k, v]) => [FIELD_MAP[k], v])
  );

module.exports = async function workspaceRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/', auth, async (req) => {
    const userId = req.user.sub;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId);
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

  fastify.get('/:id/stats', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase.rpc('get_workspace_stats', { ws_id: id });
    if (error) {
      const [contacts, messages, flows] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
        supabase.from('flows').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('is_active', true),
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
