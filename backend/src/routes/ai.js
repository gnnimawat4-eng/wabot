/**
 * AI Routes — /ai/*
 * POST /ai/generate-flows  — generate WhatsApp flows via Groq
 */
const { logError } = require('../services/errorLogger');

module.exports = async function aiRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.post('/generate-flows', auth, async (req, reply) => {
    const { businessName, businessType, description } = req.body || {};

    if (!description?.trim()) {
      return reply.code(400).send({ error: 'description is required' });
    }
    if (!process.env.GROQ_API_KEY) {
      return reply.code(503).send({ error: 'AI not configured — set GROQ_API_KEY on the server' });
    }

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const systemPrompt = `You are a WhatsApp chatbot flow builder for Indian businesses.

CRITICAL RULE: Return ONLY a JSON array with EXACTLY ONE object. Never more than one.

The single flow object must follow this EXACT structure:
{
  "name": "string",
  "trigger_keywords": "string",
  "steps": [
    {
      "type": "message",
      "label": "string",
      "config": {"message": "string"}
    },
    {
      "type": "on_reply",
      "label": "string",
      "config": {"message": "string"},
      "children": [
        {
          "type": "branch",
          "label": "string",
          "config": {"reply_contains": "1"},
          "children": [
            {
              "type": "message",
              "label": "string",
              "config": {"message": "string"}
            }
          ]
        }
      ]
    }
  ]
}

ABSOLUTE RULES:
- Return array with ONE object only: [{ ... }]
- All menu branches go inside on_reply children array
- Never create separate flow objects for sub-menus
- Keep messages short (under 100 words)
- Use Hindi-English mix for Indian businesses`;

    const biz = businessName?.trim() || 'this business';
    const bt  = businessType  || 'general';

    const userPrompt = `Business name: ${biz}
Business type: ${bt}
Description: ${description.trim()}

Generate ONE complete WhatsApp chatbot flow for this business.
All menu options must be branch children inside a single on_reply node.
Use actual details from the description (prices, timings, phone numbers, etc).
Return ONLY the JSON array with exactly one flow object, nothing else.`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        model:       'llama-3.3-70b-versatile',
        max_tokens:  4096,
        temperature: 0.4,
      });

      const text  = completion.choices[0]?.message?.content || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        return reply.code(500).send({ error: 'AI returned unexpected format. Please try again.' });
      }

      let flows;
      try { flows = JSON.parse(match[0]); }
      catch { return reply.code(500).send({ error: 'Failed to parse AI response. Please try again.' }); }

      if (!Array.isArray(flows)) {
        return reply.code(500).send({ error: 'AI response was not an array. Please try again.' });
      }

      // Enforce single flow — if AI disobeyed and returned multiple, take only the first
      if (flows.length > 1) {
        console.warn(`[AI] Returned ${flows.length} flows — enforcing single flow, discarding rest`);
        flows = [flows[0]];
      }

      return { flows, truncated: flows.length > 1 };
    } catch (err) {
      console.error('AI generate-flows error:', err?.message);
      logError(err, { source: 'groq', route: 'ai/generate-flows' }).catch(() => {});
      return reply.code(500).send({ error: err?.message || 'AI generation failed' });
    }
  });
};
