const { supabase } = require('../services/supabase');
const { setProfilePhoto, getProfilePhoto, updateBusinessProfile } = require('../services/whatsappProfile');

// Maps live DB column names → frontend field names
const toWorkspace = (row) => ({
  id: row.id,
  name: row.name,
  owner_id: row.user_id,
  wa_phone_number_id: row.phone_number_id ?? null,
  wa_phone_number: row.phone_number ?? null,
  wa_access_token: row.access_token ?? null,
  wa_business_id: row.waba_id ?? null,
  ai_system_prompt: row.ai_system_prompt ?? null,
  business_type: row.business_type ?? null,
  onboarding_completed: row.onboarding_completed ?? false,
  wa_profile_photo_url: row.wa_profile_photo_url ?? null,
  wa_about: row.wa_about ?? null,
  wa_business_description: row.wa_business_description ?? null,
  wa_business_email: row.wa_business_email ?? null,
  wa_business_website: row.wa_business_website ?? null,
  wa_business_vertical: row.wa_business_vertical ?? null,
  wa_profile_synced_at: row.wa_profile_synced_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// Maps frontend field names → live DB column names (for PATCH body)
const FIELD_MAP = {
  name: 'name',
  wa_phone_number_id: 'phone_number_id',
  wa_phone_number: 'phone_number',
  wa_access_token: 'access_token',
  wa_business_id: 'waba_id',
  ai_system_prompt: 'ai_system_prompt',
  business_type: 'business_type',
  onboarding_completed: 'onboarding_completed',
};

const toDb = (body) =>
  Object.fromEntries(
    Object.entries(body)
      .filter(([k]) => FIELD_MAP[k] !== undefined)
      .map(([k, v]) => [FIELD_MAP[k], v])
  );

module.exports = async function workspaceRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  // ── List workspaces (exclude soft-deleted) ──────────────────────────────
  fastify.get('/', auth, async (req) => {
    const userId = req.user.sub;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw error;
    return (data || []).map(toWorkspace);
  });

  fastify.post('/', auth, async (req, reply) => {
    const userId = req.user.sub;
    const { name } = req.body || {};
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name, user_id: userId })
      .select()
      .single();
    if (error) throw error;

    await supabase.from('subscriptions').insert({
      workspace_id: data.id,
      user_id: userId,
      plan: 'trial',
      status: 'trial',
      amount: 0,
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).catch((e) => console.error('Trial subscription error:', e.message));

    return reply.code(201).send(toWorkspace(data));
  });

  fastify.get('/:id', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return toWorkspace(data);
  });

  fastify.patch('/:id', auth, async (req) => {
    const { id } = req.params;
    const updates = toDb(req.body || {});
    if (Object.keys(updates).length === 0) {
      return { error: 'No valid fields to update' };
    }
    const { data, error } = await supabase
      .from('workspaces')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toWorkspace(data);
  });

  // ── Soft delete workspace ───────────────────────────────────────────────
  fastify.delete('/:id', auth, async (req, reply) => {
    const { id } = req.params;
    const userId = req.user.sub;
    const { error } = await supabase
      .from('workspaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // ── Trash: get all deleted items for this workspace ─────────────────────
  fastify.get('/:id/trash', auth, async (req) => {
    const { id } = req.params;
    const userId = req.user.sub;

    const [contacts, flows, broadcasts, workspaces] = await Promise.all([
      supabase.from('contacts').select('id, name, phone, deleted_at').eq('workspace_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('flows').select('id, name, deleted_at').eq('workspace_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('broadcasts').select('id, name, deleted_at').eq('workspace_id', id).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('workspaces').select('id, name, deleted_at').eq('user_id', userId).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ]);

    return {
      contacts:   contacts.data   || [],
      flows:      flows.data      || [],
      broadcasts: broadcasts.data || [],
      workspaces: workspaces.data || [],
    };
  });

  // ── Trash: restore an item ──────────────────────────────────────────────
  fastify.patch('/:id/trash/restore/:type/:itemId', auth, async (req, reply) => {
    const { type, itemId } = req.params;
    const tables = { contacts: 'contacts', flows: 'flows', broadcasts: 'broadcasts', workspaces: 'workspaces' };
    const table = tables[type];
    if (!table) return reply.code(400).send({ error: 'Invalid type' });

    const { error } = await supabase.from(table).update({ deleted_at: null }).eq('id', itemId);
    if (error) throw error;
    return reply.code(200).send({ ok: true });
  });

  // ── Trash: permanently delete an item ──────────────────────────────────
  fastify.delete('/:id/trash/permanent/:type/:itemId', auth, async (req, reply) => {
    const { type, itemId } = req.params;
    const tables = { contacts: 'contacts', flows: 'flows', broadcasts: 'broadcasts', workspaces: 'workspaces' };
    const table = tables[type];
    if (!table) return reply.code(400).send({ error: 'Invalid type' });

    const { error } = await supabase.from(table).delete().eq('id', itemId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // ── Locations (tables / rooms) ──────────────────────────────────────────
  fastify.get('/:id/locations', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('location_qr')
      .select('*')
      .eq('workspace_id', id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  });

  fastify.post('/:id/locations', auth, async (req, reply) => {
    const { id } = req.params;
    const { name, location_type } = req.body || {};
    if (!name || !location_type) return reply.code(400).send({ error: 'name and location_type are required' });

    const { data, error } = await supabase
      .from('location_qr')
      .insert({ workspace_id: id, name, location_type })
      .select()
      .single();
    if (error) throw error;
    return reply.code(201).send(data);
  });

  fastify.patch('/:id/locations/:locationId', auth, async (req, reply) => {
    const { id, locationId } = req.params;
    const { name } = req.body || {};
    if (!name || !name.trim()) return reply.code(400).send({ error: 'name is required' });

    const { data, error } = await supabase
      .from('location_qr')
      .update({ name: name.trim() })
      .eq('id', locationId)
      .eq('workspace_id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  fastify.delete('/:id/locations/:locationId', auth, async (req, reply) => {
    const { id, locationId } = req.params;
    const { error } = await supabase
      .from('location_qr')
      .delete()
      .eq('id', locationId)
      .eq('workspace_id', id);
    if (error) throw error;
    return reply.code(204).send();
  });

  // ── Smart Menu (smart_menus table) ──────────────────────────────────────
  fastify.get('/:id/smart-menu', auth, async (req) => {
    const { id } = req.params;
    const { data } = await supabase
      .from('smart_menus').select('*').eq('workspace_id', id).maybeSingle();
    return data || null;
  });

  // Create or update — explicit check avoids needing a UNIQUE constraint for upsert
  fastify.post('/:id/smart-menu', auth, async (req, reply) => {
    const { id } = req.params;
    const { business_name, languages, options } = req.body || {};
    if (!business_name?.trim()) return reply.code(400).send({ error: 'business_name is required' });

    try {
      const payload = {
        workspace_id:  id,
        business_name: business_name.trim(),
        languages:     languages || ['english', 'hindi', 'hinglish'],
        options:       options   || [],
        is_active:     true,
        updated_at:    new Date().toISOString(),
      };

      // Check if a record already exists for this workspace
      const { data: existing } = await supabase
        .from('smart_menus').select('id').eq('workspace_id', id).maybeSingle();

      let data, error;
      if (existing?.id) {
        ({ data, error } = await supabase
          .from('smart_menus').update(payload).eq('workspace_id', id).select().single());
      } else {
        ({ data, error } = await supabase
          .from('smart_menus').insert(payload).select().single());
      }

      if (error) {
        console.error('Smart menu save error:', JSON.stringify(error));
        return reply.code(500).send({ error: error.message || 'Failed to save smart menu' });
      }
      return reply.code(201).send(data);
    } catch (err) {
      console.error('Smart menu save exception:', err?.message);
      return reply.code(500).send({ error: err?.message || 'Failed to save smart menu' });
    }
  });

  // Partial update (e.g. one option reply edited inline)
  fastify.patch('/:id/smart-menu', auth, async (req, reply) => {
    const { id } = req.params;
    try {
      const body = req.body || {};
      const allowed = ['business_name', 'languages', 'options', 'is_active'];
      const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('smart_menus').update(updates).eq('workspace_id', id).select().single();
      if (error) {
        console.error('Smart menu patch error:', JSON.stringify(error));
        return reply.code(500).send({ error: error.message || 'Failed to update smart menu' });
      }
      return data;
    } catch (err) {
      console.error('Smart menu patch exception:', err?.message);
      return reply.code(500).send({ error: err?.message || 'Failed to update smart menu' });
    }
  });

  fastify.delete('/:id/smart-menu', auth, async (req, reply) => {
    const { id } = req.params;
    await supabase.from('smart_menus').delete().eq('workspace_id', id);
    return reply.code(204).send();
  });

  // ── Analytics (full dashboard data) ────────────────────────────────────
  fastify.get('/:id/analytics', auth, async (req) => {
    const { id } = req.params;

    const now = new Date();
    const som  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const solm = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const d30  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      mThisM, mLastM,
      arThisM, arLastM,
      allContacts,
      frThisM, frLastM,
      msgs30d,
      recent,
      runs30d,
    ] = await Promise.all([
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('created_at', som),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('created_at', solm).lt('created_at', som),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).eq('direction', 'outbound').gte('created_at', som),
      supabase.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', id).eq('direction', 'outbound').gte('created_at', solm).lt('created_at', som),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
      supabase.from('flow_runs').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('started_at', som),
      supabase.from('flow_runs').select('*', { count: 'exact', head: true }).eq('workspace_id', id).gte('started_at', solm).lt('started_at', som),
      supabase.from('messages').select('created_at').eq('workspace_id', id).gte('created_at', d30).order('created_at'),
      supabase.from('messages').select('body, direction, created_at, contacts(name, phone)').eq('workspace_id', id).eq('direction', 'inbound').order('created_at', { ascending: false }).limit(10),
      supabase.from('flow_runs').select('flow_id, flows(name)').eq('workspace_id', id).gte('started_at', d30),
    ]);

    // Messages over time — fill all 30 days so chart has no gaps
    const dayMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      dayMap[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
    }
    for (const m of msgs30d.data || []) {
      const d = new Date(m.created_at);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      if (k in dayMap) dayMap[k]++;
    }
    const messages_over_time = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

    // Peak hours
    const hourMap = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const m of msgs30d.data || []) {
      hourMap[new Date(m.created_at).getHours()].count++;
    }

    // Top flows
    const flowCount = {};
    const flowName  = {};
    for (const r of runs30d.data || []) {
      if (!r.flow_id) continue;
      flowCount[r.flow_id] = (flowCount[r.flow_id] || 0) + 1;
      if (r.flows?.name) flowName[r.flow_id] = r.flows.name;
    }
    const top_flows = Object.entries(flowCount)
      .map(([fid, count]) => ({ name: flowName[fid] || 'Unnamed', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const pct = (curr, prev) => {
      const c = curr || 0, p = prev || 0;
      return p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
    };

    return {
      stats: {
        messages_this_month:   mThisM.count  || 0,
        messages_pct:          pct(mThisM.count,  mLastM.count),
        auto_replies_this_month: arThisM.count || 0,
        auto_replies_pct:      pct(arThisM.count, arLastM.count),
        active_contacts:       allContacts.count || 0,
        flows_triggered:       frThisM.count || 0,
        flows_triggered_pct:   pct(frThisM.count, frLastM.count),
      },
      messages_over_time,
      top_flows,
      peak_hours: hourMap,
      recent_activity: (recent.data || []).map((m) => ({
        body:          m.body,
        direction:     m.direction,
        created_at:    m.created_at,
        contact_name:  m.contacts?.name  || 'Unknown',
        contact_phone: m.contacts?.phone || '',
      })),
    };
  });

  // ── WhatsApp Business Profile ───────────────────────────────────────────────

  // GET /workspaces/:id/whatsapp-profile — fetch from Meta + cache in DB
  fastify.get('/:id/whatsapp-profile', auth, async (req, reply) => {
    const { id } = req.params;
    const { data: ws, error } = await supabase.from('workspaces').select('*').eq('id', id).single();
    if (error) return reply.code(404).send({ error: 'Workspace not found' });

    const phoneId = ws.phone_number_id;
    const token   = ws.access_token;
    if (!phoneId || !token) return reply.code(400).send({ error: 'WhatsApp not connected' });

    try {
      const profile = await getProfilePhoto(phoneId, token);
      // Cache fetched values in DB
      await supabase.from('workspaces').update({
        wa_profile_photo_url:    profile.profile_picture_url ?? ws.wa_profile_photo_url,
        wa_about:                profile.about               ?? ws.wa_about,
        wa_business_description: profile.description         ?? ws.wa_business_description,
        wa_business_email:       profile.email               ?? ws.wa_business_email,
        wa_business_website:     (profile.websites || [])[0] ?? ws.wa_business_website,
        wa_business_vertical:    profile.vertical            ?? ws.wa_business_vertical,
        wa_profile_synced_at:    new Date().toISOString(),
      }).eq('id', id);
      return { ...profile, synced_at: new Date().toISOString() };
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('OAuthException') || msg.includes('access token')) {
        return reply.code(401).send({ error: 'Access token expired. Please reconnect WhatsApp in settings.' });
      }
      console.error('WA profile fetch error:', msg);
      return reply.code(500).send({ error: msg || 'Failed to fetch WhatsApp profile' });
    }
  });

  // POST /workspaces/:id/whatsapp-profile/photo — upload multipart image, resize, set on WA
  fastify.post('/:id/whatsapp-profile/photo', auth, async (req, reply) => {
    const { id } = req.params;
    const { data: ws, error } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', id).single();
    if (error) return reply.code(404).send({ error: 'Workspace not found' });

    const phoneId = ws.phone_number_id;
    const token   = ws.access_token;
    if (!phoneId || !token) return reply.code(400).send({ error: 'WhatsApp not connected' });

    // Read uploaded file via @fastify/multipart
    let fileBuffer;
    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file uploaded' });
      const mimetype = data.mimetype || '';
      if (!mimetype.startsWith('image/')) return reply.code(400).send({ error: 'Only image files are allowed' });
      fileBuffer = await data.toBuffer();
      if (fileBuffer.length > 5 * 1024 * 1024) return reply.code(400).send({ error: 'Image must be under 5 MB' });
    } catch (err) {
      return reply.code(400).send({ error: err.message || 'Failed to read uploaded file' });
    }

    try {
      const result = await setProfilePhoto(phoneId, token, fileBuffer);
      // Re-fetch updated profile to get the new photo URL
      let photoUrl = null;
      try {
        const refreshed = await getProfilePhoto(phoneId, token);
        photoUrl = refreshed.profile_picture_url ?? null;
      } catch { /* non-critical */ }
      await supabase.from('workspaces').update({ wa_profile_photo_url: photoUrl, wa_profile_synced_at: new Date().toISOString() }).eq('id', id);
      return { success: true, photo_url: photoUrl, mediaId: result.mediaId };
    } catch (err) {
      const msg = err.message || '';
      console.error('WA photo upload error:', msg);
      if (msg.includes('OAuthException') || msg.includes('access token')) {
        return reply.code(401).send({ error: 'Access token expired. Please reconnect WhatsApp in settings.' });
      }
      if (msg.includes('verified') || msg.includes('Phone number')) {
        return reply.code(400).send({ error: 'Phone number must be verified in Meta Business Manager.' });
      }
      return reply.code(500).send({ error: msg || 'Failed to update profile photo' });
    }
  });

  // POST /workspaces/:id/whatsapp-profile — update business text info
  fastify.post('/:id/whatsapp-profile', auth, async (req, reply) => {
    const { id } = req.params;
    const { data: ws, error } = await supabase.from('workspaces').select('phone_number_id, access_token').eq('id', id).single();
    if (error) return reply.code(404).send({ error: 'Workspace not found' });

    const phoneId = ws.phone_number_id;
    const token   = ws.access_token;
    if (!phoneId || !token) return reply.code(400).send({ error: 'WhatsApp not connected' });

    const { about, description, email, website, vertical } = req.body || {};

    try {
      await updateBusinessProfile(phoneId, token, {
        about,
        description,
        email,
        websites:  website ? [website] : undefined,
        vertical,
      });
      // Persist to DB
      await supabase.from('workspaces').update({
        wa_about:                about       ?? null,
        wa_business_description: description ?? null,
        wa_business_email:       email       ?? null,
        wa_business_website:     website     ?? null,
        wa_business_vertical:    vertical    ?? null,
        wa_profile_synced_at:    new Date().toISOString(),
      }).eq('id', id);
      return { success: true };
    } catch (err) {
      const msg = err.message || '';
      console.error('WA profile update error:', msg);
      if (msg.includes('OAuthException') || msg.includes('access token')) {
        return reply.code(401).send({ error: 'Access token expired. Please reconnect WhatsApp in settings.' });
      }
      return reply.code(500).send({ error: msg || 'Failed to update business profile' });
    }
  });

  fastify.get('/:id/stats', auth, async (req) => {
    const { id } = req.params;
    const { data, error } = await supabase.rpc('get_workspace_stats', { ws_id: id });
    if (error) {
      const [contacts, messages, flows] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', id).is('deleted_at', null),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', id),
        supabase.from('flows').select('id', { count: 'exact', head: true }).eq('workspace_id', id).eq('is_active', true).is('deleted_at', null),
      ]);
      return {
        total_contacts: contacts.count || 0,
        total_messages: messages.count || 0,
        active_flows: flows.count || 0,
      };
    }
    return data;
  });
};
