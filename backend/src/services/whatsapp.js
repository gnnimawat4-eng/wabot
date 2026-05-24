const axios = require('axios');

const BASE = `https://graph.facebook.com/${process.env.META_API_VERSION}`;

const client = axios.create({ baseURL: BASE });

const headers = (token) => ({ Authorization: `Bearer ${token}` });

async function sendText(phoneNumberId, token, to, body) {
  return client.post(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  }, { headers: headers(token) });
}

async function sendTemplate(phoneNumberId, token, to, name, languageCode, components = []) {
  return client.post(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name, language: { code: languageCode }, components },
  }, { headers: headers(token) });
}

async function sendButtons(phoneNumberId, token, to, body, buttons) {
  return client.post(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((b, i) => ({
          type: 'reply',
          reply: { id: `btn_${i}`, title: b },
        })),
      },
    },
  }, { headers: headers(token) });
}

async function markRead(phoneNumberId, token, messageId) {
  return client.post(`/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, { headers: headers(token) });
}

module.exports = { sendText, sendTemplate, sendButtons, markRead };
