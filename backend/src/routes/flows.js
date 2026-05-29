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

  // AI flow generation
  fastify.post('/:workspaceId/ai-generate-flows', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { description } = req.body || {};

    if (!description?.trim()) return reply.code(400).send({ error: 'Description is required' });
    if (!process.env.GROQ_API_KEY) return reply.code(503).send({ error: 'AI not configured — set GROQ_API_KEY on the server' });

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `You are a WhatsApp automation expert. Based on the business description, generate a list of WhatsApp flows in JSON format.

Each flow must have:
- name: flow name
- trigger_keywords: comma separated keywords that trigger this flow
- message: the complete WhatsApp message to send (with emojis, friendly tone)

Generate 3-5 relevant flows for this business. Make the messages natural, helpful, and in the business's language style.

Return ONLY a valid JSON array, no explanation, no markdown:
[
  {
    "name": "Flow name",
    "trigger_keywords": "keyword1, keyword2, keyword3",
    "message": "The complete WhatsApp message with emojis"
  }
]`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: description.trim() },
        ],
        model: 'llama-3.1-8b-instant',
        max_tokens: 2000,
        temperature: 0.7,
      });

      const text = completion.choices[0]?.message?.content || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return reply.code(500).send({ error: 'AI returned an unexpected format. Please try again.' });

      const flows = JSON.parse(match[0]);
      if (!Array.isArray(flows)) return reply.code(500).send({ error: 'Invalid response format from AI' });

      return flows;
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
