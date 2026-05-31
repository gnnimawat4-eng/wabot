const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const LANGUAGE_RULES = `LANGUAGE RULES:
- Default language: English (Indian English style, friendly and warm)
- Only switch to Hindi if customer explicitly requests Hindi using words like: "hindi", "हिंदी", "hindi mein", "hindi me", "हिंदी में"
- If customer writes in Hindi script (देवनागरी), reply in Hindi
- If customer writes in English or Hinglish, always reply in English
- Never auto-detect and switch language without an explicit customer request
- Indian English style: friendly, use "kindly", "please", "do let us know"`;

const DEFAULT_RULES = `IMPORTANT RULES:
- Keep reply under 50 words
- Be friendly and professional
- Guide customers: type 'catalog' for products, 'hi' to start
- Never mention you are AI`;

async function getAIReply(customerMessage, workspaceName, systemPrompt) {
  const base = systemPrompt
    ? systemPrompt
    : `You are a helpful WhatsApp business assistant for ${workspaceName}.`;

  const baseInstruction = `${LANGUAGE_RULES}\n\n${base}\n\n${DEFAULT_RULES}`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: baseInstruction },
      { role: 'user', content: customerMessage },
    ],
    model: 'llama-3.3-70b-versatile',
    max_tokens: 150,
  });
  return completion.choices[0].message.content;
}

module.exports = { getAIReply };
