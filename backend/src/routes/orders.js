const { supabase } = require('../services/supabase');
const wa = require('../services/whatsapp');

const STATUS_MSGS = {
  preparing:        '👨‍🍳 Your order is being prepared!',
  out_for_delivery: '🛵 Your order is on the way! ETA 20–30 mins.',
  delivered:        '✅ Order delivered! Enjoy your meal 😊',
  cancelled:        '❌ Your order has been cancelled.',
};

async function getWs(workspaceId) {
  const { data } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', workspaceId).single();
  return data;
}

async function notifyCustomer(workspaceId, phone, text) {
  const ws = await getWs(workspaceId);
  if (ws?.phone_number_id && ws?.access_token) {
    await wa.sendText(ws.phone_number_id, ws.access_token, phone, text).catch(() => {});
  }
}

module.exports = async function ordersRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // GET /workspaces/:id/orders[?status=xxx]
  fastify.get('/:id/orders', auth, async (req, reply) => {
    const { id } = req.params;
    const { status } = req.query;

    let q = supabase
      .from('orders')
      .select('*, contacts(name, phone)')
      .eq('workspace_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (status && status !== 'all') q = q.eq('status', status);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });

  // POST /workspaces/:id/orders  (public — called by flow engine / webhook)
  fastify.post('/:id/orders', async (req, reply) => {
    const { id } = req.params;
    const { phone_number, items, total_amount, contact_id, notes } = req.body || {};
    if (!phone_number) return reply.code(400).send({ error: 'phone_number is required' });

    const { data: ws } = await supabase.from('workspaces').select('upi_id').eq('id', id).single();

    const { data, error } = await supabase.from('orders').insert({
      workspace_id: id,
      contact_id:   contact_id || null,
      phone_number,
      items:        items || [],
      total_amount: total_amount || 0,
      upi_id:       ws?.upi_id || null,
      notes:        notes || null,
    }).select().single();

    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  // PATCH /workspaces/:id/orders/:orderId/confirm
  fastify.patch('/:id/orders/:orderId/confirm', auth, async (req, reply) => {
    const { id, orderId } = req.params;

    const { error } = await supabase.from('orders').update({
      status:                'confirmed',
      payment_confirmed_at:  new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    }).eq('id', orderId).eq('workspace_id', id);

    if (error) return reply.code(500).send({ error: error.message });

    const { data: o } = await supabase.from('orders').select('phone_number, id').eq('id', orderId).single();
    if (o) {
      await notifyCustomer(id, o.phone_number,
        `✅ *Order Confirmed!*\n\nThank you for your payment! 🙏\nYour order is being prepared.\n⏱ Est. time: 30 minutes\n\n🆔 Order: #${o.id.slice(-6).toUpperCase()}`
      );
    }
    return { success: true };
  });

  // PATCH /workspaces/:id/orders/:orderId/reject
  fastify.patch('/:id/orders/:orderId/reject', auth, async (req, reply) => {
    const { id, orderId } = req.params;

    const { error } = await supabase.from('orders').update({
      status:     'cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('workspace_id', id);

    if (error) return reply.code(500).send({ error: error.message });

    const { data: o } = await supabase.from('orders').select('phone_number').eq('id', orderId).single();
    if (o) {
      await notifyCustomer(id, o.phone_number,
        `❌ Payment not verified.\nPlease contact us directly for help.`
      );
    }
    return { success: true };
  });

  // PATCH /workspaces/:id/orders/:orderId/status  { status }
  fastify.patch('/:id/orders/:orderId/status', auth, async (req, reply) => {
    const { id, orderId } = req.params;
    const { status } = req.body || {};

    if (!status) return reply.code(400).send({ error: 'status is required' });

    const { error } = await supabase.from('orders').update({
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId).eq('workspace_id', id);

    if (error) return reply.code(500).send({ error: error.message });

    if (STATUS_MSGS[status]) {
      const { data: o } = await supabase.from('orders').select('phone_number').eq('id', orderId).single();
      if (o) await notifyCustomer(id, o.phone_number, STATUS_MSGS[status]);
    }
    return { success: true };
  });
};
