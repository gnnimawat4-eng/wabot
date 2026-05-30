const { Worker } = require('bullmq');
const { redis } = require('../services/redis');
const { supabase } = require('../services/supabase');
const wa = require('../services/whatsapp');

const RATE_LIMIT_MS = Math.ceil(60000 / 80); // ~750ms per message = 80/min

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createBroadcastWorker() {
  return new Worker('broadcasts', async (job) => {
    const { broadcastId, workspaceId } = job.data;

    // Check if cancelled before starting
    const { data: check } = await supabase
      .from('broadcasts').select('status').eq('id', broadcastId).single();
    if (check?.status === 'cancelled') return;

    await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', broadcastId);

    const { data: broadcast } = await supabase
      .from('broadcasts').select('*').eq('id', broadcastId).single();

    const { data: workspace } = await supabase
      .from('workspaces').select('*').eq('id', workspaceId).single();

    if (!broadcast || !workspace?.wa_phone_number_id || !workspace?.wa_access_token) {
      await supabase.from('broadcasts').update({ status: 'failed' }).eq('id', broadcastId);
      return;
    }

    // Build audience
    const filter = broadcast.audience_filter || {};
    let query = supabase.from('contacts')
      .select('id, phone').eq('workspace_id', workspaceId).eq('opted_in', true).is('deleted_at', null);
    if (filter.type === 'tag' && filter.value) query = query.contains('tags', [filter.value]);
    // Legacy filter support
    if (filter.stage) query = query.eq('stage', filter.stage);
    if (filter.tags?.length) query = query.contains('tags', filter.tags);

    const { data: contacts } = await query;
    if (!contacts?.length) {
      await supabase.from('broadcasts').update({ status: 'completed' }).eq('id', broadcastId);
      return;
    }

    let sent = 0, failed = 0;

    for (const contact of contacts) {
      // Abort if cancelled mid-send
      const { data: fresh } = await supabase
        .from('broadcasts').select('status').eq('id', broadcastId).single();
      if (fresh?.status === 'cancelled') return;

      try {
        if (broadcast.message) {
          // Direct text message broadcast
          await wa.sendText(
            workspace.wa_phone_number_id,
            workspace.wa_access_token,
            contact.phone,
            broadcast.message
          );
        } else {
          // Template broadcast (legacy)
          await wa.sendTemplate(
            workspace.wa_phone_number_id,
            workspace.wa_access_token,
            contact.phone,
            broadcast.template_name,
            broadcast.template_language,
            broadcast.template_components
          );
        }
        sent++;
        await supabase.from('messages').insert({
          workspace_id: workspaceId,
          contact_id:   contact.id,
          direction:    'outbound',
          type:         broadcast.message ? 'text' : 'template',
          body:         broadcast.message || broadcast.template_name,
          status:       'sent',
        });
      } catch {
        failed++;
      }

      await supabase.from('broadcasts')
        .update({ sent_count: sent, failed_count: failed }).eq('id', broadcastId);

      await sleep(RATE_LIMIT_MS);
    }

    await supabase.from('broadcasts')
      .update({ status: 'completed', sent_count: sent, failed_count: failed })
      .eq('id', broadcastId);

  }, { connection: redis, concurrency: 2 });
}

module.exports = { createBroadcastWorker };
