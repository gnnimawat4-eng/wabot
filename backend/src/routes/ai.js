/**
 * AI Routes — /ai/*
 * POST /ai/generate-flows
 *
 * Approach: we own the tree structure 100%. Groq only fills in plain text
 * values (names, messages, prices). This prevents the model from mangling
 * the JSON shape and guarantees a valid connected flow every time.
 */
const { logError } = require('../services/errorLogger');

// ── Business-type detection ────────────────────────────────────────────────────

const TYPE_KEYWORDS = {
  restaurant: ['restaurant','food','menu','order','kitchen','cafe','dhaba','biryani','pizza','burger','thali','snack','eat','dining'],
  hotel:      ['hotel','room','booking','stay','check-in','checkout','resort','lodge','hostel','accommodation','suite','bed'],
  clinic:     ['clinic','doctor','appointment','hospital','health','medical','patient','consult','dental','eye','physio','therapy'],
};

function detectType(text) {
  const lower = text.toLowerCase();
  for (const [type, kws] of Object.entries(TYPE_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) return type;
  }
  return 'general';
}

// ── Templates (structure only — {{PLACEHOLDERS}} filled by Groq) ───────────────

function branchBlock(num, nameKey, itemsKey) {
  return {
    type: 'branch',
    label: `{{${nameKey}}}`,
    config: { reply_contains: String(num) },
    children: [
      {
        type: 'message',
        label: `{{${nameKey}}} Menu`,
        config: { message: `{{${itemsKey}}}` },
      },
      {
        type: 'on_reply',
        label: 'Wait for item',
        config: { message: '' },
        children: [
          {
            type: 'message',
            label: 'Confirm',
            config: { message: '{{CONFIRM_MSG}}' },
          },
          {
            type: 'on_reply',
            label: 'Wait YES',
            config: { message: '' },
            children: [
              {
                type: 'branch',
                label: 'Confirmed',
                config: { reply_contains: 'yes' },
                children: [
                  {
                    type: 'message',
                    label: 'Order Done',
                    config: { message: '{{ORDER_DONE_MSG}}' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

const TEMPLATES = {
  restaurant: {
    name: '{{FLOW_NAME}}',
    trigger_keywords: 'hi,hello,menu,hlo,order',
    steps: [
      { type: 'message', label: 'Welcome', config: { message: '{{WELCOME_MSG}}' } },
      {
        type: 'on_reply',
        label: 'Wait for choice',
        config: { message: 'Please reply 1, 2 or 3' },
        children: [
          branchBlock(1, 'CAT1_NAME', 'CAT1_ITEMS'),
          branchBlock(2, 'CAT2_NAME', 'CAT2_ITEMS'),
          branchBlock(3, 'CAT3_NAME', 'CAT3_ITEMS'),
        ],
      },
    ],
  },

  hotel: {
    name: '{{FLOW_NAME}}',
    trigger_keywords: 'hi,hello,book,room,stay',
    steps: [
      { type: 'message', label: 'Welcome', config: { message: '{{WELCOME_MSG}}' } },
      {
        type: 'on_reply',
        label: 'Wait for choice',
        config: { message: 'Please reply 1, 2 or 3' },
        children: [
          {
            type: 'branch', label: 'Book Room', config: { reply_contains: '1' },
            children: [
              { type: 'message', label: 'Room Types', config: { message: '{{CAT1_ITEMS}}' } },
              {
                type: 'on_reply', label: 'Wait room choice', config: { message: '' },
                children: [
                  { type: 'message', label: 'Booking Confirm', config: { message: '{{CONFIRM_MSG}}' } },
                  {
                    type: 'on_reply', label: 'Wait YES', config: { message: '' },
                    children: [
                      { type: 'branch', label: 'Confirmed', config: { reply_contains: 'yes' },
                        children: [{ type: 'message', label: 'Booked', config: { message: '{{ORDER_DONE_MSG}}' } }] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'branch', label: 'Services', config: { reply_contains: '2' },
            children: [{ type: 'message', label: 'Services Info', config: { message: '{{CAT2_ITEMS}}' } }],
          },
          {
            type: 'branch', label: 'Contact', config: { reply_contains: '3' },
            children: [{ type: 'message', label: 'Contact Info', config: { message: '{{CAT3_ITEMS}}' } }],
          },
        ],
      },
    ],
  },

  clinic: {
    name: '{{FLOW_NAME}}',
    trigger_keywords: 'hi,hello,appointment,consult,doctor',
    steps: [
      { type: 'message', label: 'Welcome', config: { message: '{{WELCOME_MSG}}' } },
      {
        type: 'on_reply',
        label: 'Wait for choice',
        config: { message: 'Please reply 1, 2 or 3' },
        children: [
          {
            type: 'branch', label: 'Book Appointment', config: { reply_contains: '1' },
            children: [
              { type: 'message', label: 'Appointment Info', config: { message: '{{CAT1_ITEMS}}' } },
              {
                type: 'on_reply', label: 'Wait details', config: { message: '' },
                children: [
                  { type: 'message', label: 'Confirm Appt', config: { message: '{{CONFIRM_MSG}}' } },
                  {
                    type: 'on_reply', label: 'Wait YES', config: { message: '' },
                    children: [
                      { type: 'branch', label: 'Confirmed', config: { reply_contains: 'yes' },
                        children: [{ type: 'message', label: 'Booked', config: { message: '{{ORDER_DONE_MSG}}' } }] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'branch', label: 'Services & Fees', config: { reply_contains: '2' },
            children: [{ type: 'message', label: 'Services', config: { message: '{{CAT2_ITEMS}}' } }],
          },
          {
            type: 'branch', label: 'Timings & Location', config: { reply_contains: '3' },
            children: [{ type: 'message', label: 'Directions', config: { message: '{{CAT3_ITEMS}}' } }],
          },
        ],
      },
    ],
  },

  general: {
    name: '{{FLOW_NAME}}',
    trigger_keywords: 'hi,hello,hey,start,info',
    steps: [
      { type: 'message', label: 'Welcome', config: { message: '{{WELCOME_MSG}}' } },
      {
        type: 'on_reply',
        label: 'Wait for choice',
        config: { message: 'Please reply 1, 2 or 3' },
        children: [
          {
            type: 'branch', label: '{{CAT1_NAME}}', config: { reply_contains: '1' },
            children: [{ type: 'message', label: '{{CAT1_NAME}} Info', config: { message: '{{CAT1_ITEMS}}' } }],
          },
          {
            type: 'branch', label: '{{CAT2_NAME}}', config: { reply_contains: '2' },
            children: [{ type: 'message', label: '{{CAT2_NAME}} Info', config: { message: '{{CAT2_ITEMS}}' } }],
          },
          {
            type: 'branch', label: '{{CAT3_NAME}}', config: { reply_contains: '3' },
            children: [{ type: 'message', label: '{{CAT3_NAME}} Info', config: { message: '{{CAT3_ITEMS}}' } }],
          },
        ],
      },
    ],
  },
};

// ── Placeholder fill ───────────────────────────────────────────────────────────

function fillTemplate(template, values) {
  let str = JSON.stringify(template);
  for (const [key, val] of Object.entries(values)) {
    // Escape the value for safe JSON embedding (newlines, quotes, backslashes)
    const safe = String(val)
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    str = str.split(`{{${key}}}`).join(safe);
  }
  // Replace any unfilled placeholders with empty string
  str = str.replace(/\{\{[A-Z0-9_]+\}\}/g, '');
  return JSON.parse(str);
}

// ── Groq prompt for placeholder values ────────────────────────────────────────

function buildValuesPrompt(bizName, description, bizType) {
  const typeHints = {
    restaurant: 'categories like food types (e.g. Starters, Main Course, Desserts/Drinks)',
    hotel:      'room types and hotel services',
    clinic:     'appointment booking, medical services/fees, timings and location',
    general:    'main service categories',
  };

  return `You are filling in text for a WhatsApp chatbot for an Indian business.
Return ONLY a valid JSON object with exactly these keys. No explanation, no markdown.

{
  "FLOW_NAME": "2-4 word flow name",
  "WELCOME_MSG": "Friendly welcome message listing 3 menu options numbered 1-3. Max 60 words. Use actual business details.",
  "CAT1_NAME": "Name of category 1 (1-3 words)",
  "CAT1_ITEMS": "List of items/options for category 1 with prices if available. Max 60 words.",
  "CAT2_NAME": "Name of category 2 (1-3 words)",
  "CAT2_ITEMS": "List of items/options for category 2 with prices if available. Max 60 words.",
  "CAT3_NAME": "Name of category 3 (1-3 words)",
  "CAT3_ITEMS": "List of items/options for category 3 with prices if available. Max 60 words.",
  "CONFIRM_MSG": "Short confirmation prompt asking customer to reply YES. Max 20 words.",
  "ORDER_DONE_MSG": "Order/booking confirmed message with next steps or payment info. Max 50 words."
}

Business name: ${bizName}
Business type: ${bizType}
Hints for categories: ${typeHints[bizType] || typeHints.general}
Description: ${description}`;
}

// ── Route ──────────────────────────────────────────────────────────────────────

module.exports = async function aiRoutes(fastify) {
  const auth = { onRequest: [fastify.authenticate] };

  fastify.post('/generate-flows', auth, async (req, reply) => {
    const { businessName, businessType: rawBizType, description } = req.body || {};

    if (!description?.trim()) {
      return reply.code(400).send({ error: 'description is required' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return reply.code(503).send({ error: 'AI not configured — set GEMINI_API_KEY on the server' });
    }

    const biz     = businessName?.trim() || 'this business';
    const bizType = detectType(description + ' ' + (rawBizType || '') + ' ' + biz);
    const template = TEMPLATES[bizType];

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    try {
      const result = await model.generateContent(buildValuesPrompt(biz, description.trim(), bizType));
      const text = result.response.text() || '{}';

      // Extract JSON object from response
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('[AI] No JSON object in response:', text.slice(0, 200));
        return reply.code(500).send({ error: 'AI returned unexpected format. Please try again.' });
      }

      let values;
      try { values = JSON.parse(match[0]); }
      catch (e) {
        console.error('[AI] JSON parse failed:', e.message, match[0].slice(0, 200));
        return reply.code(500).send({ error: 'Failed to parse AI response. Please try again.' });
      }

      console.log(`[AI] bizType=${bizType} values:`, JSON.stringify(values).slice(0, 300));

      const flow = fillTemplate(template, values);
      return { flows: [flow], truncated: false };

    } catch (err) {
      console.error('AI generate-flows error:', err?.message);
      logError(err, { source: 'gemini', route: 'ai/generate-flows' }).catch(() => {});
      return reply.code(500).send({ error: err?.message || 'AI generation failed' });
    }
  });
};
