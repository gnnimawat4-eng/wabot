const { supabase } = require('../services/supabase');

const toFlow = (row) => ({
  ...row,
  trigger: { type: row.trigger_type, ...(row.trigger_config || {}) },
});

const triggerToDb = (trigger = {}) => ({
  trigger_type: trigger.type || 'keyword',
  trigger_config: trigger,
});

const toStepRow = (s, i, flowId, workspaceId) => ({
  flow_id: flowId,
  workspace_id: workspaceId,
  step_order: i,
  message_type: s.type || 'text',
  message_body: s.config || {},
  position: i,
  type: s.type,
  config: s.config || {},
});

module.exports = async function flowRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.get('/:workspaceId/flows', auth, async (req) => {
    const { workspaceId } = req.params;
    const { data, error } = await supabase
      .from('flows')
      .select('*, flow_steps(*)')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toFlow);
  });

  fastify.post('/:workspaceId/flows', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { name, trigger, steps = [] } = req.body;

    const { data: flow, error } = await supabase
      .from('flows')
      .insert({ workspace_id: workspaceId, name, ...triggerToDb(trigger), is_active: false })
      .select()
      .single();
    if (error) throw error;

    if (steps.length) {
      const rows = steps.map((s, i) => toStepRow(s, i, flow.id, workspaceId));
      const { error: stepsError } = await supabase.from('flow_steps').insert(rows);
      if (stepsError) throw stepsError;
    }

    return reply.code(201).send(toFlow(flow));
  });

  fastify.get('/:workspaceId/flows/:flowId', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { data, error } = await supabase
      .from('flows')
      .select('*, flow_steps(*)')
      .eq('id', flowId)
      .eq('workspace_id', workspaceId)
      .single();
    if (error) throw error;
    return toFlow(data);
  });

  fastify.patch('/:workspaceId/flows/:flowId', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { name, trigger, is_active } = req.body;
    const update = { name, is_active };
    if (trigger) Object.assign(update, triggerToDb(trigger));
    const { data, error } = await supabase
      .from('flows')
      .update(update)
      .eq('id', flowId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) throw error;
    return toFlow(data);
  });

  // Soft delete
  fastify.delete('/:workspaceId/flows/:flowId', auth, async (req, reply) => {
    const { workspaceId, flowId } = req.params;
    const { error } = await supabase
      .from('flows')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', flowId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return reply.code(204).send();
  });

  // AI flow generation — returns JSON only; frontend creates selected flows
  fastify.post('/:workspaceId/ai-generate-flows', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { description, business_type } = req.body || {};

    if (!description?.trim()) return reply.code(400).send({ error: 'Description is required' });
    if (!process.env.GROQ_API_KEY) return reply.code(503).send({ error: 'AI not configured — set GROQ_API_KEY on the server' });

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `You are a WhatsApp chatbot expert. Generate ALL necessary flows for this business.
RULES:
- Each flow = one trigger keyword set + one short reply message (max 3 lines)
- Keep every message under 150 characters
- Return ONLY a valid JSON array, nothing else
- Include a "category" field: "welcome", "language", "menu", "submenu", or "faq"`;

    const bt = business_type || 'general';
    const userPrompt = `Business: ${description.trim()}
Type: ${bt}

Generate ALL these flows (no limit — generate as many as needed):
1. Welcome/greeting flow (trigger: hi,hello,hey,hii,start,menu) — category: welcome
2. Language select flows if needed (trigger: 1,2,3) — category: language
3. One flow for EACH main menu option (trigger: 1,2,3,4) — category: menu
4. Sub-option flows e.g. pricing tiers, specific services (trigger: 11,12,21,22…) — category: submenu
5. FAQ flows: timings, location, price, contact, offers — category: faq

${bt === 'hotel' ? `Hotel minimum 15 flows covering: welcome, room types+prices, check-in/out, room service, facilities (pool/gym/spa), restaurant, location/directions, contact, booking, special offers` :
  bt === 'restaurant' ? `Restaurant minimum 12 flows: welcome, menu categories, today's special, table booking, delivery, timings, location, contact, offers` :
  bt === 'salon' ? `Salon minimum 12 flows: welcome, services list, pricing, appointment booking, today's offers, timings, location, contact` :
  `Generate minimum 10 flows covering: welcome, all services, pricing, contact, location, timings, FAQs`}

JSON format — array of objects:
[
  { "name": "flow name", "trigger": "keyword1,keyword2", "message": "reply text", "category": "welcome" },
  ...
]`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 4000,
        temperature: 0.65,
      });

      const text = completion.choices[0]?.message?.content || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return reply.code(500).send({ error: 'AI returned unexpected format. Please try again.' });

      let aiFlows;
      try { aiFlows = JSON.parse(match[0]); }
      catch { return reply.code(500).send({ error: 'Failed to parse AI response. Please try again.' }); }

      if (!Array.isArray(aiFlows) || !aiFlows.length) {
        return reply.code(500).send({ error: 'AI returned empty flows. Please try again.' });
      }

      // Normalise and return — do NOT create in DB (frontend creates after preview)
      return {
        flows: aiFlows
          .filter((f) => f.name && f.trigger)
          .map((f) => ({
            name:     f.name,
            trigger:  f.trigger,
            message:  f.message || '',
            category: f.category || 'faq',
          })),
      };
    } catch (err) {
      console.error('AI flow generation error:', err?.message);
      return reply.code(500).send({ error: err?.message || 'AI generation failed' });
    }
  });

  fastify.put('/:workspaceId/flows/:flowId/steps', auth, async (req) => {
    const { workspaceId, flowId } = req.params;
    const { steps } = req.body;

    await supabase.from('flow_steps').delete().eq('flow_id', flowId);

    if (steps?.length) {
      const rows = steps.map((s, i) => toStepRow(s, i, flowId, workspaceId));
      const { data, error } = await supabase.from('flow_steps').insert(rows).select();
      if (error) throw error;
      return data;
    }
    return [];
  });
};
