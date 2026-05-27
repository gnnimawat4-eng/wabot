const { supabase } = require('../services/supabase');
const wa = require('../services/whatsapp');

module.exports = async function hotelRoomRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /:id/hotel-rooms — list rooms with running totals
  fastify.get('/:id/hotel-rooms', auth, async (req, reply) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('hotel_rooms')
      .select('*, room_bills(amount, quantity, status)')
      .eq('workspace_id', id)
      .order('room_number');
    if (error) return reply.code(500).send({ error: error.message });

    const rooms = (data || []).map((room) => {
      const pending = (room.room_bills || []).filter((b) => b.status === 'pending');
      const running_total = pending.reduce((s, b) => s + b.amount * b.quantity, 0);
      const { room_bills: _, ...rest } = room;
      return { ...rest, running_total };
    });
    return rooms;
  });

  // POST /:id/hotel-rooms — create a room
  fastify.post('/:id/hotel-rooms', auth, async (req, reply) => {
    const { id } = req.params;
    const { room_number } = req.body;
    const { data, error } = await supabase
      .from('hotel_rooms')
      .insert({ workspace_id: id, room_number, status: 'vacant' })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  // DELETE /:id/hotel-rooms/:roomId
  fastify.delete('/:id/hotel-rooms/:roomId', auth, async (req, reply) => {
    const { id, roomId } = req.params;
    await supabase.from('hotel_rooms').delete().eq('id', roomId).eq('workspace_id', id);
    return { ok: true };
  });

  // POST /:id/hotel-rooms/:roomId/checkin
  fastify.post('/:id/hotel-rooms/:roomId/checkin', auth, async (req, reply) => {
    const { id, roomId } = req.params;
    const { guest_name, guest_phone, expected_checkout } = req.body;

    const cleanPhone = (guest_phone || '').replace(/\D/g, '');

    const { data: room, error } = await supabase
      .from('hotel_rooms')
      .update({
        status: 'occupied',
        guest_name,
        guest_phone: cleanPhone,
        check_in_time: new Date().toISOString(),
        expected_checkout: expected_checkout || null,
        actual_checkout_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('workspace_id', id)
      .select()
      .single();

    if (error) return reply.code(500).send({ error: error.message });

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (workspace?.phone_number_id && workspace?.access_token && cleanPhone) {
      const checkoutStr = expected_checkout || 'as per schedule';
      const msg = `Welcome to ${workspace.name || 'our hotel'}! 🏨\n\nDear ${guest_name}, your check-in for *Room ${room.room_number}* is confirmed.\n\n📅 Expected checkout: ${checkoutStr}\n\nFor room service or orders, just message us here! 😊`;
      await wa.sendText(workspace.phone_number_id, workspace.access_token, cleanPhone, msg).catch(console.error);
      await supabase.from('messages').insert({
        workspace_id: id,
        contact_id: null,
        direction: 'outbound',
        type: 'text',
        body: msg,
        status: 'sent',
      }).catch(() => {});
    }

    return room;
  });

  // POST /:id/hotel-rooms/:roomId/checkout
  fastify.post('/:id/hotel-rooms/:roomId/checkout', auth, async (req, reply) => {
    const { id, roomId } = req.params;

    const { data: room } = await supabase
      .from('hotel_rooms')
      .select('*')
      .eq('id', roomId)
      .eq('workspace_id', id)
      .single();

    if (!room) return reply.code(404).send({ error: 'Room not found' });

    const { data: bills } = await supabase
      .from('room_bills')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('ordered_at');

    const total = (bills || []).reduce((s, b) => s + b.amount * b.quantity, 0);

    await supabase.from('hotel_rooms').update({
      status: 'vacant',
      actual_checkout_time: new Date().toISOString(),
      guest_name: null,
      guest_phone: null,
      check_in_time: null,
      expected_checkout: null,
      updated_at: new Date().toISOString(),
    }).eq('id', roomId).eq('workspace_id', id);

    await supabase.from('room_bills').update({ status: 'paid' }).eq('room_id', roomId).eq('status', 'pending');

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (workspace?.phone_number_id && workspace?.access_token && room.guest_phone) {
      const itemLines = (bills || [])
        .map((b) => `• ${b.item_name} x${b.quantity} — ₹${(b.amount * b.quantity).toFixed(2)}`)
        .join('\n');
      const msg = `Thank you for staying at ${workspace.name || 'our hotel'}! 🙏\n\nDear ${room.guest_name}, checkout for *Room ${room.room_number}* is complete.\n\n🧾 *Bill Summary:*\n${itemLines || '(No charges)'}\n\n*Total: ₹${total.toFixed(2)}*\n\nHope to see you again! 😊`;
      await wa.sendText(workspace.phone_number_id, workspace.access_token, room.guest_phone, msg).catch(console.error);
    }

    return { ok: true, total };
  });

  // GET /:id/hotel-rooms/:roomId/bill
  fastify.get('/:id/hotel-rooms/:roomId/bill', auth, async (req, reply) => {
    const { id, roomId } = req.params;
    const { data, error } = await supabase
      .from('room_bills')
      .select('*')
      .eq('room_id', roomId)
      .eq('workspace_id', id)
      .eq('status', 'pending')
      .order('ordered_at');
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  // POST /:id/hotel-rooms/:roomId/bill
  fastify.post('/:id/hotel-rooms/:roomId/bill', auth, async (req, reply) => {
    const { id, roomId } = req.params;
    const { item_name, amount, quantity } = req.body;
    const { data, error } = await supabase
      .from('room_bills')
      .insert({ workspace_id: id, room_id: roomId, item_name, amount: amount || 0, quantity: quantity || 1 })
      .select()
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  // DELETE /:id/hotel-rooms/:roomId/bill/:billId
  fastify.delete('/:id/hotel-rooms/:roomId/bill/:billId', auth, async (req, reply) => {
    const { id, billId } = req.params;
    await supabase.from('room_bills').delete().eq('id', billId).eq('workspace_id', id);
    return { ok: true };
  });

  // POST /:id/hotel-rooms/:roomId/send-bill — send bill update via WhatsApp
  fastify.post('/:id/hotel-rooms/:roomId/send-bill', auth, async (req, reply) => {
    const { id, roomId } = req.params;

    const { data: room } = await supabase
      .from('hotel_rooms')
      .select('*')
      .eq('id', roomId)
      .eq('workspace_id', id)
      .single();

    if (!room?.guest_phone) return reply.code(400).send({ error: 'No guest phone' });

    const { data: bills } = await supabase
      .from('room_bills')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('ordered_at');

    const total = (bills || []).reduce((s, b) => s + b.amount * b.quantity, 0);

    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (!workspace?.phone_number_id || !workspace?.access_token) {
      return reply.code(400).send({ error: 'WhatsApp not configured' });
    }

    const itemLines = (bills || [])
      .map((b) => `• ${b.item_name} x${b.quantity} — ₹${(b.amount * b.quantity).toFixed(2)}`)
      .join('\n');
    const msg = `🧾 Bill Update — *Room ${room.room_number}*\n\n${itemLines || '(No items yet)'}\n\n*Running Total: ₹${total.toFixed(2)}*`;

    await wa.sendText(workspace.phone_number_id, workspace.access_token, room.guest_phone, msg);
    return { ok: true };
  });
};

// Exported for use in webhook.js — checks if inbound phone has an active hotel room
async function handleRoomOrderWebhook(workspaceId, phone, messageBody) {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data: room } = await supabase
    .from('hotel_rooms')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('guest_phone', cleanPhone)
    .eq('status', 'occupied')
    .maybeSingle();

  if (!room) return false;

  // Record the order as a bill item (amount 0 — staff will update price)
  await supabase.from('room_bills').insert({
    workspace_id: workspaceId,
    room_id: room.id,
    item_name: messageBody,
    amount: 0,
    quantity: 1,
  }).catch(console.error);

  // Fetch workspace for sending reply
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();

  if (workspace?.phone_number_id && workspace?.access_token) {
    const reply = `✅ Your request has been noted for *Room ${room.room_number}*, ${room.guest_name}!\n\nOur team will be with you shortly. 🙏`;
    await wa.sendText(workspace.phone_number_id, workspace.access_token, cleanPhone, reply).catch(console.error);
    await supabase.from('messages').insert({
      workspace_id: workspaceId,
      contact_id: null,
      direction: 'outbound',
      type: 'text',
      body: reply,
      status: 'sent',
    }).catch(() => {});
  }

  return true;
}

module.exports.handleRoomOrderWebhook = handleRoomOrderWebhook;
