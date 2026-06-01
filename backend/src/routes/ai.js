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

CRITICAL RULES — read carefully:
1. Generate EXACTLY ONE self-contained flow per array item. ALL menu options and sub-menus MUST be nested as branch children inside that single flow. NEVER create a separate flow object for a sub-category or menu section.
2. Every branch node is a CHILD of the on_reply node — siblings in the "children" array, NOT separate top-level flows.
3. First message = welcome + numbered menu (max 5 options).
4. Each branch reply = max 2 short lines. No essays.
5. Use Hindi-English mix for Indian businesses.
6. Keep every message under 100 words.
7. Return ONLY a valid JSON array — no explanation, no markdown fences.

CORRECT structure — ALL branches as siblings inside one on_reply:
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
        "config": { "message": "Reply 1-4 to continue" },
        "children": [
          {
            "type": "branch",
            "label": "Menu",
            "config": { "reply_contains": "1", "message": "🍛 Dal Makhani ₹180\\n🍗 Butter Chicken ₹320\\nOrder: 98765-43210" }
          },
          {
            "type": "branch",
            "label": "Book Table",
            "config": { "reply_contains": "2", "message": "📅 To book: call 98765-43210 or reply with date & time!" }
          },
          {
            "type": "branch",
            "label": "Timings",
            "config": { "reply_contains": "3", "message": "🕐 Open Mon-Sun, 11 AM – 11 PM. Last order 10:30 PM." }
          },
          {
            "type": "branch",
            "label": "Location",
            "config": { "reply_contains": "4", "message": "📍 123 Main St, near Metro Station. Google Maps: [link]" }
          }
        ]
      }
    ]
  }
]

WRONG — never do this (sub-menus as separate top-level flows):
[ { "name": "Main Menu", ... }, { "name": "Food Menu", ... }, { "name": "Booking", ... } ]
That is WRONG. All of those must be branch children inside ONE flow.`;

    const biz = businessName?.trim() || 'this business';
    const bt  = businessType  || 'general';

    const userPrompt = `Business name: ${biz}
Business type: ${bt}
Description: ${description.trim()}

Generate ${countNum} WhatsApp chatbot flow${countNum > 1 ? 's' : ''} for this business.
${countNum > 1
  ? `Each flow must handle a COMPLETELY DIFFERENT use case (e.g. "Main Menu", "Complaint", "Track Order" — NOT sub-sections of the same menu).
Each flow is fully self-contained: its own trigger keywords, its own welcome message, and ALL its branches nested as children inside that single flow.`
  : 'The flow must be fully self-contained with ALL menu options as branch children of one on_reply node — no sub-menus split into separate flows.'}
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
