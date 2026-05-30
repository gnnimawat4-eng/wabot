const { supabase } = require('../services/supabase');
const { broadcastsQueue } = require('../services/redis');

module.exports = async function broadcastRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── List ─────────────────────────────────────────────────────────────────
  fastify.get('/:workspaceId/broadcasts', auth, async (req) => {
    const { workspaceId } = req.params;
    const { data, error } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });

  // ── Create (supports text message + scheduling) ───────────────────────
  fastify.post('/:workspaceId/broadcasts', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const {
      name,
      message,
      template_name,
      template_language,
      template_components,
      target,            // { type: 'all' | 'tag' | 'custom', value?: string, phones?: string[] }
      audience_filter,   // legacy
      scheduled_at,      // ISO string or null → send now
    } = req.body || {};

    if (!name) return reply.code(400).send({ error: 'name is required' });
    if (!message && !template_name) return reply.code(400).send({ error: 'message or template_name is required' });

    const resolvedTarget = target || audience_filter || {};
    const isScheduled = scheduled_at && new Date(scheduled_at) > new Date();

    // Count recipients upfront
    let recipientQuery = supabase.from('contacts').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('opted_in', true).is('deleted_at', null);
    if (resolvedTarget.type === 'tag' && resolvedTarget.value) {
      recipientQuery = recipientQuery.contains('tags', [resolvedTarget.value]);
    }
    const { count: recipientCount } = await recipientQuery;

    const { data: broadcast, error } = await supabase
      .from('broadcasts')
      .insert({
        workspace_id:        workspaceId,
        name,
        message:             message || null,
        template_name:       template_name || null,
        template_language:   template_language || 'en',
        template_components: template_components || [],
        audience_filter:     resolvedTarget,
        recipient_count:     recipientCount || 0,
        status:              isScheduled ? 'scheduled' : 'queued',
        sent_count:          0,
        failed_count:        0,
        scheduled_at:        scheduled_at || null,
      })
      .select()
      .single();
    if (error) throw error;

    const delay = isScheduled ? new Date(scheduled_at).getTime() - Date.now() : 0;
    await broadcastsQueue.add(
      'send-broadcast',
      { broadcastId: broadcast.id, workspaceId },
      { delay: Math.max(0, delay), attempts: 2, backoff: { type: 'fixed', delay: 10000 } }
    );

    return reply.code(201).send(broadcast);
  });

  // ── Cancel scheduled broadcast ────────────────────────────────────────
  fastify.patch('/:workspaceId/broadcasts/:broadcastId/cancel', auth, async (req, reply) => {
    const { workspaceId, broadcastId } = req.params;
    const { data, error } = await supabase
      .from('broadcasts')
      .update({ status: 'cancelled' })
      .eq('id', broadcastId)
      .eq('workspace_id', workspaceId)
      .in('status', ['scheduled', 'queued'])
      .select()
      .single();
    if (error) throw error;
    if (!data) return reply.code(404).send({ error: 'Broadcast not found or already sent' });
    return data;
  });

  // ── Single ────────────────────────────────────────────────────────────
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

  // ── Soft delete ────────────────────────────────────────────────────────
  fastify.delete('/:workspaceId/broadcasts/:broadcastId', auth, async (req, reply) => {
    const { workspaceId, broadcastId } = req.params;
    const { error } = await supabase
      .from('broadcasts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', broadcastId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return reply.code(204).send();
  });
};
