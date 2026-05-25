const { supabase } = require('../services/supabase');

// Live DB uses trigger_type + trigger_config; reconstruct trigger for frontend
const toFlow = (row) => ({
  ...row,
  trigger: { type: row.trigger_type, ...(row.trigger_config || {}) },
});

// Split frontend trigger object into DB columns
const triggerToDb = (trigger = {}) => ({
  trigger_type: trigger.type || 'keyword',
  trigger_config: trigger,
});

// Build step row satisfying both old NOT-NULL columns and new typed columns
const toStepRow = (s, i, flowId, workspaceId) => ({
  flow_id: flowId,
  workspace_id: workspaceId,
  // old required columns
  step_order: i,
  message_type: s.type || 'text',
  message_body: s.config || {},
  // new typed columns
  position: i,
  type: s.type,
  config: s.config || {},
});

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
    return (data || []).map(toFlow);
  });

  fastify.post('/:workspaceId/flows', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { name, trigger, steps = [] } = req.body;

    const { data: flow, error } = await supabase
      .from('flows')
      .insert({ workspace_id: workspaceId, name, ...triggerToDb(trigger), is_active: false })
      .select()
      .single();
    if (error) throw error;

    if (steps.length) {
      const rows = steps.map((s, i) => toStepRow(s, i, flow.id, workspaceId));
      const { error: stepsError } = await supabase.from('flow_steps').insert(rows);
      if (stepsError) throw stepsError;
    }

    return reply.code(201).send(toFlow(flow));
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
    return toFlow(data);
  });

  fastify.patch('/:workspaceId/flows/:flowId', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { name, trigger, is_active } = req.body;
    const update = { name, is_active };
    if (trigger) Object.assign(update, triggerToDb(trigger));
    const { data, error } = await supabase
      .from('flows')
      .update(update)
      .eq('id', flowId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return toFlow(data);
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

  fastify.put('/:workspaceId/flows/:flowId/steps', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { steps } = req.body;

    await supabase.from('flow_steps').delete().eq('flow_id', flowId);

    if (steps?.length) {
      const rows = steps.map((s, i) => toStepRow(s, i, flowId, workspaceId));
      const { data, error } = await supabase.from('flow_steps').insert(rows).select();
      if (error) throw error;
      return data;
    }
    return [];
  });
};
