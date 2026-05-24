const { supabase } = require('../services/supabase');

module.exports = async function flowRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/:workspaceId/flows', auth, async (req) => {
    const { workspaceId } = req.params;
    const { data, error } = await supabase
      .from('flows')
      .select('*, flow_steps(*)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });

  fastify.post('/:workspaceId/flows', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { name, trigger, steps = [] } = req.body;

    const { data: flow, error } = await supabase
      .from('flows')
      .insert({ workspace_id: workspaceId, name, trigger, is_active: false })
      .select()
      .single();
    if (error) throw error;

    if (steps.length) {
      const stepsToInsert = steps.map((s, i) => ({
        flow_id: flow.id,
        workspace_id: workspaceId,
        position: i,
        type: s.type,
        config: s.config || {},
      }));
      await supabase.from('flow_steps').insert(stepsToInsert);
    }

    return reply.code(201).send(flow);
  });

  fastify.get('/:workspaceId/flows/:flowId', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { data, error } = await supabase
      .from('flows')
      .select('*, flow_steps(*)')
      .eq('id', flowId)
      .eq('workspace_id', workspaceId)
      .single();
    if (error) throw error;
    return data;
  });

  fastify.patch('/:workspaceId/flows/:flowId', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { name, trigger, is_active } = req.body;
    const { data, error } = await supabase
      .from('flows')
      .update({ name, trigger, is_active })
      .eq('id', flowId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  fastify.delete('/:workspaceId/flows/:flowId', auth, async (req, reply) => {
    const { workspaceId, flowId } = req.params;
    const { error } = await supabase
      .from('flows')
      .delete()
      .eq('id', flowId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // Steps CRUD
  fastify.put('/:workspaceId/flows/:flowId/steps', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { steps } = req.body;

    await supabase.from('flow_steps').delete().eq('flow_id', flowId);

    if (steps?.length) {
      const rows = steps.map((s, i) => ({
        flow_id: flowId,
        workspace_id: workspaceId,
        position: i,
        type: s.type,
        config: s.config || {},
      }));
      const { data, error } = await supabase.from('flow_steps').insert(rows).select();
      if (error) throw error;
      return data;
    }
    return [];
  });
};
