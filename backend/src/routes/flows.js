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

  // AI flow generation — generates + creates all flows in one call
  fastify.post('/:workspaceId/ai-generate-flows', auth, async (req, reply) => {
    const { workspaceId } = req.params;
    const { description, business_type } = req.body || {};

    if (!description?.trim()) return reply.code(400).send({ error: 'Description is required' });
    if (!process.env.GROQ_API_KEY) return reply.code(503).send({ error: 'AI not configured — set GROQ_API_KEY on the server' });

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `You are a WhatsApp chatbot flow builder. Create simple, SHORT flows.
Rules:
- First message must be a welcome with numbered menu MAX 4 options
- Each option leads to ONE short reply (max 2 lines)
- NO long paragraphs
- NO asking for more info
- Keep every message under 100 words
- Return ONLY JSON, no explanation`;

    const userPrompt = `Business: ${description.trim()}
Type: ${business_type || 'general'}

Create a flow JSON array. Each flow has:
- name: flow name
- trigger: comma separated keywords
- steps: array of message steps

Create these flows:
1. Main Menu (trigger: hi,hello,hey) - welcome + numbered menu
2. Option 1 response flow (trigger: 1)
3. Option 2 response flow (trigger: 2)
4. Option 3 response flow (trigger: 3)
5. Option 4 response flow (trigger: 4)

JSON format:
[
  {
    "name": "Main Menu",
    "trigger": "hi,hello,hey",
    "steps": [{ "type": "send_message", "config": { "message": "short welcome + menu" } }]
  },
  {
    "name": "Option 1",
    "trigger": "1",
    "steps": [{ "type": "send_message", "config": { "message": "short reply" } }]
  }
]`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.6,
      });

      const text = completion.choices[0]?.message?.content || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return reply.code(500).send({ error: 'AI returned unexpected format. Please try again.' });

      let aiFlows;
      try {
        aiFlows = JSON.parse(match[0]);
      } catch {
        return reply.code(500).send({ error: 'Failed to parse AI response. Please try again.' });
      }
      if (!Array.isArray(aiFlows) || !aiFlows.length) {
        return reply.code(500).send({ error: 'AI returned empty flows. Please try again.' });
      }

      // Create all flows in DB with is_active: true
      const created = [];
      for (const f of aiFlows) {
        if (!f.name || !f.trigger) continue;

        const steps = (f.steps || []).map((s) => ({
          type: s.type === 'message' ? 'send_message' : (s.type || 'send_message'),
          config: s.config || {},
        }));

        const { data: flow, error: flowErr } = await supabase
          .from('flows')
          .insert({
            workspace_id: workspaceId,
            name: f.name,
            ...triggerToDb({ type: 'keyword', keyword: f.trigger }),
            is_active: true,
          })
          .select()
          .single();

        if (flowErr) { console.error('Flow create error:', flowErr.message); continue; }

        if (steps.length) {
          const rows = steps.map((s, i) => toStepRow(s, i, flow.id, workspaceId));
          await supabase.from('flow_steps').insert(rows);
        }

        created.push({ id: flow.id, name: flow.name, trigger: f.trigger });
      }

      return { created: created.length, flows: created };
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
