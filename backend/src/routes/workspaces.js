const { supabase } = require('../services/supabase');

module.exports = async function workspaceRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/', auth, async (req) => {
    const userId = req.user.sub;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId);
    if (error) throw error;
    return data;
  });

  fastify.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const { name } = req.body;
    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name, owner_id: userId })
      .select()
      .single();
    if (error) throw error;
    return reply.code(201).send(data);
  });

  fastify.get('/:id', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  });

  fastify.patch('/:id', auth, async (req) => {
    const { id } = req.params;
    const updates = req.body;
    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  fastify.get('/:id/stats', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase.rpc('get_workspace_stats', { ws_id: id });
    if (error) {
      // fallback manual stats
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
