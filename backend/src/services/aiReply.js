const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const DEFAULT_RULES = `IMPORTANT RULES:
- Detect the language of customer message and reply in SAME language
- If Hindi/Hinglish → reply in Hindi
- If English → reply in English
- Keep reply under 50 words
- Be friendly and professional
- Guide customers: type 'catalog' for products, 'hi' to start
- Never mention you are AI`;

async function getAIReply(customerMessage, workspaceName, systemPrompt) {
  const baseInstruction = systemPrompt
    ? `${systemPrompt}\n\n${DEFAULT_RULES}`
    : `You are a helpful WhatsApp business assistant for ${workspaceName}.\n${DEFAULT_RULES}`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: baseInstruction },
      { role: 'user', content: customerMessage },
    ],
    model: 'llama-3.1-8b-instant',
    max_tokens: 150,
  });
  return completion.choices[0].message.content;
}

module.exports = { getAIReply };
