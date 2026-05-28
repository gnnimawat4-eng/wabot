const { supabase } = require('../services/supabase');

module.exports = async function contactRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/:workspaceId/contacts', auth, async (req) => {
    const { workspaceId } = req.params;
    const { stage, search, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (stage) query = query.eq('stage', stage);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data, count };
  });

  fastify.post('/:workspaceId/contacts', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { name, phone, stage = 'new', tags, notes } = req.body;
    const { data, error } = await supabase
      .from('contacts')
      .insert({ workspace_id: workspaceId, name, phone, stage, tags, notes })
      .select()
      .single();
    if (error) throw error;
    return reply.code(201).send(data);
  });

  fastify.patch('/:workspaceId/contacts/:contactId', auth, async (req) => {
    const { workspaceId, contactId } = req.params;
    const { data, error } = await supabase
      .from('contacts')
      .update(req.body)
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  fastify.delete('/:workspaceId/contacts/:contactId', auth, async (req, reply) => {
    const { workspaceId, contactId } = req.params;
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // Bulk CSV import
  fastify.post('/:workspaceId/contacts/import', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { contacts } = req.body; // array of { name, phone, stage?, tags? }
    if (!Array.isArray(contacts) || !contacts.length) {
      return reply.code(400).send({ error: 'contacts array required' });
    }
    const rows = contacts.map((c) => ({ ...c, workspace_id: workspaceId, stage: c.stage || 'new' }));
    const { data, error } = await supabase.from('contacts').upsert(rows, { onConflict: 'workspace_id,phone' }).select();
    if (error) throw error;
    return { imported: data.length };
  });

  // Send outbound message from inbox
  fastify.post('/:workspaceId/contacts/:contactId/send', auth, async (req, reply) => {
    const { workspaceId, contactId } = req.params;
    const { body } = req.body;
    const wa = require('../services/whatsapp');
    const { data: contact } = await supabase.from('contacts').select('phone').eq('id', contactId).single();
    const { data: workspace } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', workspaceId).single();
    if (!contact || !workspace?.phone_number_id) return reply.code(400).send({ error: 'WhatsApp not configured' });
    await wa.sendText(workspace.phone_number_id, workspace.access_token, contact.phone, body);
    const { data: msg } = await supabase.from('messages').insert({
      workspace_id: workspaceId, contact_id: contactId, direction: 'outbound', type: 'text', body, status: 'sent',
    }).select().single();
    return reply.code(201).send(msg);
  });

  // Messages for a contact
  fastify.get('/:workspaceId/contacts/:contactId/messages', auth, async (req) => {
    const { workspaceId, contactId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return data;
  });
};
