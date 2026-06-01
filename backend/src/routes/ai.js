/**
 * AI Routes — /ai/*
 * POST /ai/generate-flows  — generate WhatsApp flows via Groq
 */
const { logError } = require('../services/errorLogger');

module.exports = async function aiRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.post('/generate-flows', auth, async (req, reply) => {
    const { businessName, businessType, description, count } = req.body || {};

    if (!description?.trim()) {
      return reply.code(400).send({ error: 'description is required' });
    }
    if (!process.env.GROQ_API_KEY) {
      return reply.code(503).send({ error: 'AI not configured — set GROQ_API_KEY on the server' });
    }

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const countNum = count === 'full' ? 8 : Math.max(1, Math.min(10, parseInt(count) || 3));

    const systemPrompt = `You are a WhatsApp chatbot flow expert for Indian SMEs.
Generate SHORT, PRACTICAL flows. Rules:
- First message = welcome + numbered menu MAX 5 options
- Each option = ONE short reply (max 2 lines, no essays)
- Use simple Hindi-English mix if businessType is Indian
- Branch nodes must have reply_contains like "1", "2", "book" etc
- Keep every message under 100 words
- Return ONLY a valid JSON array, no explanation, no markdown

Return format:
[
  {
    "name": "Main Menu",
    "trigger_keywords": "hi,hello,hey,start",
    "steps": [
      {
        "type": "message",
        "label": "Welcome",
        "config": { "message": "Welcome! 🙏\\n\\n1. View Menu\\n2. Book Table\\n3. Timings\\n4. Location" }
      },
      {
        "type": "on_reply",
        "label": "Wait for choice",
        "config": { "message": "Please choose 1-4" },
        "children": [
          {
            "type": "branch",
            "label": "Menu selected",
            "config": { "reply_contains": "1", "message": "Our menu:\\n🍛 Dal Makhani - ₹180\\n🍗 Butter Chicken - ₹320\\nOrder: 98765-43210" }
          }
        ]
      }
    ]
  }
]`;

    const biz = businessName?.trim() || 'this business';
    const bt  = businessType  || 'general';

    const userPrompt = `Business name: ${biz}
Business type: ${bt}
Description: ${description.trim()}

Generate ${countNum} WhatsApp chatbot flow${countNum > 1 ? 's' : ''} for this business.
Each flow should handle a different use case relevant to the business.
Use actual details from the description (prices, timings, phone numbers, etc).
Return ONLY the JSON array, nothing else.`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        model:       'llama-3.3-70b-versatile',
        max_tokens:  4096,
        temperature: 0.65,
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

      return { flows };
    } catch (err) {
      console.error('AI generate-flows error:', err?.message);
      logError(err, { source: 'groq', route: 'ai/generate-flows' }).catch(() => {});
      return reply.code(500).send({ error: err?.message || 'AI generation failed' });
    }
  });
};
