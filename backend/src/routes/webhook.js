const crypto = require('crypto');
const { supabase } = require('../services/supabase');
const { evaluateTriggers, resumeFlowOnReply } = require('../services/flowEngine');
const wa = require('../services/whatsapp');

module.exports = async function webhookRoutes(fastify) {
  // Webhook verification
  fastify.get('/whatsapp', async (req, reply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.code(403).send('Forbidden');
  });

  // Incoming events
  fastify.post('/whatsapp', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const sig = req.headers['x-hub-signature-256'];
    if (sig) {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET || '')
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (sig !== expected) return reply.code(401).send('Invalid signature');
    }

    const body = req.body;
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return reply.send('ok');

    const phoneNumberId = value.metadata?.phone_number_id;
    const messages = value.messages || [];
    const statuses = value.statuses || [];

    for (const msg of messages) {
      await handleInbound(phoneNumberId, value.metadata?.display_phone_number, msg);
    }

    for (const status of statuses) {
      await handleStatus(status);
    }

    return reply.send('ok');
  });
};

async function handleInbound(phoneNumberId, displayPhone, msg) {
  // Live DB column is phone_number_id (not wa_phone_number_id)
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .single();

  if (!workspace) return;

  const from = msg.from;
  const contactName = msg.contacts?.[0]?.profile?.name || from;

  // Upsert contact
  let { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('workspace_id', workspace.id)
    .eq('phone', from)
    .single();

  const isNew = !contact;

  if (!contact) {
    const { data } = await supabase
      .from('contacts')
      .insert({ workspace_id: workspace.id, phone: from, name: contactName, stage: 'new' })
      .select()
      .single();
    contact = data;
  }

  if (!contact) return;

  // Extract message body (text or button reply)
  let msgBody = '';
  if (msg.type === 'text') msgBody = msg.text?.body || '';
  else if (msg.type === 'interactive') {
    msgBody = msg.interactive?.button_reply?.title
      || msg.interactive?.list_reply?.title
      || '';
  }

  await supabase.from('messages').insert({
    workspace_id: workspace.id,
    contact_id: contact.id,
    direction: 'inbound',
    type: msg.type,
    body: msgBody,
    wa_message_id: msg.id,
    status: 'delivered',
  });

  // Mark read — live DB column is access_token (not wa_access_token)
  if (workspace.access_token) {
    await wa.markRead(phoneNumberId, workspace.access_token, msg.id).catch(() => {});
  }

  // If a flow is waiting for this contact's reply, handle it and stop
  const consumed = await resumeFlowOnReply(workspace.id, contact, msgBody);
  if (consumed) return;

  // Otherwise evaluate triggers normally
  if (isNew) {
    await evaluateTriggers(workspace.id, contact, { type: 'new_contact' });
  }
  await evaluateTriggers(workspace.id, contact, { type: 'message', body: msgBody });
}

async function handleStatus(status) {
  const waMessageId = status.id;
  const st = status.status; // sent, delivered, read, failed
  await supabase
    .from('messages')
    .update({ status: st })
    .eq('wa_message_id', waMessageId);
}
