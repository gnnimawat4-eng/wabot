const { supabase } = require('../services/supabase');
const { broadcastsQueue } = require('../services/redis');

module.exports = async function broadcastRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/:workspaceId/broadcasts', auth, async (req) => {
    const { workspaceId } = req.params;
    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });

  fastify.post('/:workspaceId/broadcasts', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { name, template_name, template_language, template_components, audience_filter } = req.body;

    const { data: broadcast, error } = await supabase
      .from('broadcasts')
      .insert({
        workspace_id: workspaceId,
        name,
        template_name,
        template_language: template_language || 'en',
        template_components: template_components || [],
        audience_filter: audience_filter || {},
        status: 'queued',
        sent_count: 0,
        failed_count: 0,
      })
      .select()
      .single();
    if (error) throw error;

    await broadcastsQueue.add('send-broadcast', { broadcastId: broadcast.id, workspaceId }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
    });

    return reply.code(201).send(broadcast);
  });

  fastify.get('/:workspaceId/broadcasts/:broadcastId', auth, async (req) => {
    const { workspaceId, broadcastId } = req.params;
    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .eq('workspace_id', workspaceId)
      .single();
    if (error) throw error;
    return data;
  });
};
