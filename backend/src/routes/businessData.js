const { supabase } = require('../services/supabase');

module.exports = async function businessDataRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── business_items (menu, service, property, vehicle, class, student, staff) ──

  fastify.get('/:id/business-items', auth, async (req, reply) => {
    const { id } = req.params;
    const { category } = req.query;
    let q = supabase.from('business_items').select('*').eq('workspace_id', id).order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.post('/:id/business-items', auth, async (req, reply) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('business_items').insert({ ...req.body, workspace_id: id }).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  fastify.patch('/:id/business-items/:itemId', auth, async (req, reply) => {
    const { id, itemId } = req.params;
    const { data, error } = await supabase
      .from('business_items').update(req.body).eq('id', itemId).eq('workspace_id', id).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.delete('/:id/business-items/:itemId', auth, async (req, reply) => {
    const { id, itemId } = req.params;
    const { error } = await supabase.from('business_items').delete().eq('id', itemId).eq('workspace_id', id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(204).send();
  });

  // ── business_appointments (appointment, order, site_visit, test_drive, fee, service_booking) ──

  fastify.get('/:id/business-appointments', auth, async (req, reply) => {
    const { id } = req.params;
    const { type } = req.query;
    let q = supabase.from('business_appointments').select('*').eq('workspace_id', id).order('created_at', { ascending: false });
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.post('/:id/business-appointments', auth, async (req, reply) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('business_appointments').insert({ ...req.body, workspace_id: id }).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  fastify.patch('/:id/business-appointments/:apptId', auth, async (req, reply) => {
    const { id, apptId } = req.params;
    const { data, error } = await supabase
      .from('business_appointments').update(req.body).eq('id', apptId).eq('workspace_id', id).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.delete('/:id/business-appointments/:apptId', auth, async (req, reply) => {
    const { id, apptId } = req.params;
    const { error } = await supabase.from('business_appointments').delete().eq('id', apptId).eq('workspace_id', id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(204).send();
  });

  // ── business_leads ────────────────────────────────────────────────────────────

  fastify.get('/:id/business-leads', auth, async (req, reply) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('business_leads').select('*').eq('workspace_id', id).order('created_at', { ascending: false });
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.post('/:id/business-leads', auth, async (req, reply) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('business_leads').insert({ ...req.body, workspace_id: id }).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(201).send(data);
  });

  fastify.patch('/:id/business-leads/:leadId', auth, async (req, reply) => {
    const { id, leadId } = req.params;
    const { data, error } = await supabase
      .from('business_leads').update(req.body).eq('id', leadId).eq('workspace_id', id).select().single();
    if (error) return reply.code(500).send({ error: error.message });
    return data;
  });

  fastify.delete('/:id/business-leads/:leadId', auth, async (req, reply) => {
    const { id, leadId } = req.params;
    const { error } = await supabase.from('business_leads').delete().eq('id', leadId).eq('workspace_id', id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.code(204).send();
  });
};
