const crypto = require('crypto');
const { supabase } = require('../services/supabase');
const { evaluateTriggers, resumeFlowOnReply } = require('../services/flowEngine');
const { handleConversation } = require('../services/conversationEngine');
const { handleRoomOrderWebhook } = require('./hotelRooms');
const wa = require('../services/whatsapp');
const { getAIReply } = require('../services/aiReply');

module.exports = async function webhookRoutes(fastify) {
  // PUBLIC routes — Meta sends no JWT; onRequest: [] prevents any inherited hook
  fastify.get('/whatsapp', { onRequest: [] }, async (req, reply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.code(403).send('Forbidden');
  });

  // Incoming events — also PUBLIC
  fastify.post('/whatsapp', { onRequest: [] }, async (req, reply) => {
    // Optional signature verification (non-fatal — log mismatch but don't block)
    const sig = req.headers['x-hub-signature-256'];
    if (sig && process.env.META_APP_SECRET) {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (sig !== expected) {
        req.log.warn('Webhook signature mismatch — continuing anyway');
      }
    }

    const body = req.body;
    console.log('Received webhook:', JSON.stringify(body, null, 2));

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return reply.send('ok');

    const phoneNumberId = value.metadata?.phone_number_id;
    console.log('Looking for workspace with phone_number_id:', phoneNumberId);

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

  console.log('Workspace found:', workspace);

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

  const messageText = msg?.text?.body?.toLowerCase().trim();
  console.log('=== MESSAGE RECEIVED ===');
  console.log('Message text:', messageText);
  console.log('Message type:', msg?.type);
  console.log('Workspace ID:', workspace.id);

  await supabase.from('messages').insert({
    workspace_id: workspace.id,
    contact_id: contact.id,
    direction: 'inbound',
    type: msg.type,
    body: msgBody,
    wa_message_id: msg.id,
    status: 'delivered',
  });

  // Increment conversation count for billing (fire-and-forget)
  const month = new Date().toISOString().slice(0, 7);
  supabase.from('conversation_counts').select('id, count').eq('workspace_id', workspace.id).eq('month', month).maybeSingle()
    .then(({ data: cc }) => cc
      ? supabase.from('conversation_counts').update({ count: cc.count + 1, updated_at: new Date().toISOString() }).eq('id', cc.id)
      : supabase.from('conversation_counts').insert({ workspace_id: workspace.id, month, count: 1 })
    ).catch(() => {});

  // Mark read — live DB column is access_token (not wa_access_token)
  if (workspace.access_token) {
    await wa.markRead(phoneNumberId, workspace.access_token, msg.id).catch(() => {});
  }

  // Debug: query flows directly to verify workspace_id, active status, and steps join
  const { data: flows } = await supabase
    .from('flows')
    .select('*, flow_steps(*)')
    .eq('workspace_id', workspace.id)
    .eq('is_active', true);

  console.log('Query workspace_id:', workspace.id);
  console.log('=== FLOWS QUERY ===');
  console.log('Flows fetched:', JSON.stringify(flows, null, 2));

  // State machine: greeting / menu navigation handled here first
  const smConsumed = await handleConversation(contact, workspace, msgBody).catch((err) => {
    console.error('Conversation engine error:', err?.message); return false;
  });
  if (smConsumed) return;

  // If a flow is waiting for this contact's reply, handle it and stop
  const consumed = await resumeFlowOnReply(workspace.id, contact, msgBody);
  if (consumed) return;

  // If this is a hotel workspace and sender has an active room, route as room order
  if (msgBody && workspace.business_type === 'hotel') {
    const roomConsumed = await handleRoomOrderWebhook(workspace.id, from, msgBody).catch(() => false);
    if (roomConsumed) return;
  }

  // Evaluate triggers; track whether any flow handled the message
  console.log('=== CALLING FLOW ENGINE ===');
  let flowMatched = false;
  let matchedFlowName = null;
  let matchedFlowObj = null;
  if (isNew) {
    const result = await evaluateTriggers(workspace.id, contact, { type: 'new_contact' });
    if (result.matched) { flowMatched = true; matchedFlowName = result.flowName; matchedFlowObj = result.matchedFlow; }
  }
  if (msgBody) {
    const result = await evaluateTriggers(workspace.id, contact, { type: 'message', body: msgBody });
    if (result.matched) { flowMatched = true; matchedFlowName = result.flowName; matchedFlowObj = result.matchedFlow; }
  }

  console.log('=== FLOW MATCH ===');
  console.log('Matched flow:', matchedFlowName || 'NONE MATCHED');
  if (matchedFlowObj) {
    console.log('=== FLOW STEPS ===', JSON.stringify(matchedFlowObj.flow_steps, null, 2));
  }

  // No flow handled it — fall back to AI smart reply
  if (!flowMatched && msgBody && process.env.GROQ_API_KEY) {
    try {
      const reply = await getAIReply(msgBody, workspace.name || 'our business', workspace.ai_system_prompt || null);
      if (reply && workspace.phone_number_id && workspace.access_token) {
        await wa.sendText(workspace.phone_number_id, workspace.access_token, contact.phone, reply);
        await supabase.from('messages').insert({
          workspace_id: workspace.id,
          contact_id: contact.id,
          direction: 'outbound',
          type: 'text',
          body: reply,
          status: 'sent',
        });
      }
    } catch (err) {
      // AI failure is non-fatal — log and continue
      console.error('AI reply error:', err?.message);
    }
  }
}

async function handleStatus(status) {
  const waMessageId = status.id;
  const st = status.status; // sent, delivered, read, failed
  await supabase
    .from('messages')
    .update({ status: st })
    .eq('wa_message_id', waMessageId);
}
