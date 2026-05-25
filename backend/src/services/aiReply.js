const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function getAIReply(customerMessage, workspaceName) {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are a helpful WhatsApp business assistant for ${workspaceName}.
        IMPORTANT RULES:
        - Detect the language of customer message and reply in SAME language
        - If Hindi/Hinglish → reply in Hindi
        - If English → reply in English
        - Keep reply under 50 words
        - Be friendly and professional
        - Guide customers: type 'catalog' for products, 'hi' to start
        - Never mention you are AI`,
      },
      { role: 'user', content: customerMessage },
    ],
    model: 'llama-3.1-8b-instant',
    max_tokens: 150,
  });
  return completion.choices[0].message.content;
}

module.exports = { getAIReply };
