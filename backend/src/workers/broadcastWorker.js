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

    await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', broadcastId);

    const { data: broadcast } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .single();

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (!broadcast || !workspace?.wa_phone_number_id || !workspace?.wa_access_token) {
      await supabase.from('broadcasts').update({ status: 'failed' }).eq('id', broadcastId);
      return;
    }

    // Build audience
    let query = supabase.from('contacts').select('id, phone').eq('workspace_id', workspaceId).eq('opted_in', true);
    const filter = broadcast.audience_filter || {};
    if (filter.stage) query = query.eq('stage', filter.stage);
    if (filter.tags?.length) query = query.contains('tags', filter.tags);

    const { data: contacts } = await query;
    if (!contacts?.length) {
      await supabase.from('broadcasts').update({ status: 'completed' }).eq('id', broadcastId);
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        await wa.sendTemplate(
          workspace.wa_phone_number_id,
          workspace.wa_access_token,
          contact.phone,
          broadcast.template_name,
          broadcast.template_language,
          broadcast.template_components
        );
        sent++;
        await supabase.from('messages').insert({
          workspace_id: workspaceId,
          contact_id: contact.id,
          direction: 'outbound',
          type: 'template',
          body: broadcast.template_name,
          status: 'sent',
        });
      } catch {
        failed++;
      }

      await supabase
        .from('broadcasts')
        .update({ sent_count: sent, failed_count: failed })
        .eq('id', broadcastId);

      await sleep(RATE_LIMIT_MS);
    }

    await supabase
      .from('broadcasts')
      .update({ status: 'completed', sent_count: sent, failed_count: failed })
      .eq('id', broadcastId);

  }, { connection: redis, concurrency: 2 });
}

module.exports = { createBroadcastWorker };
