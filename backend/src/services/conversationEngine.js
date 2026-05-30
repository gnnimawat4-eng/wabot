/**
 * Smart Multi-Level WhatsApp Conversation Engine
 * Reads from the smart_menus table. Returns false if no smart menu is configured,
 * allowing the regular keyword flow engine to handle the message instead.
 *
 * State machine:
 *   ''           → not started
 *   'lang_select' → sent welcome, waiting for 1/2/3
 *   'main_menu'   → sent main menu, waiting for 1-4
 */

const { supabase } = require('./supabase');
const wa           = require('./whatsapp');

const GREETINGS = new Set([
  'hi','hello','hey','hii','helo','hi!','hello!','hey!',
  'start','menu','namaste','namaskar','hye','hai','howdy','yo',
  'नमस्ते','नमस्कार',
]);
const LANG_MAP = { '1': 'hindi', '2': 'english', '3': 'hinglish' };

function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Night';
}

function langSuffix(lang) {
  if (lang === 'hindi')    return 'hi';
  if (lang === 'hinglish') return 'hl';
  return 'en';
}

async function setContactState(contactId, updates) {
  await supabase.from('contacts').update(updates).eq('id', contactId);
}

async function sendAndRecord(workspace, contact, text) {
  if (!workspace.phone_number_id || !workspace.access_token || !text) return;
  await wa.sendText(workspace.phone_number_id, workspace.access_token, contact.phone, text);
  await supabase.from('messages').insert({
    workspace_id: workspace.id,
    contact_id:   contact.id,
    direction:    'outbound',
    type:         'text',
    body:         text,
    status:       'sent',
  });
}

function buildMainMenu(smartMenu, lang) {
  const sfx = langSuffix(lang);
  const header = lang === 'hindi'    ? 'आप क्या चाहते हैं? 😊' :
                 lang === 'hinglish' ? 'Aap kya chahte hain? 😊' :
                                      'How can we help you? 😊';
  const opts = (smartMenu.options || [])
    .map((opt, i) => `${i + 1}️⃣ ${opt[`label_${sfx}`] || opt.label_en || `Option ${i + 1}`}`)
    .join('\n');
  return `${header}\n\n${opts}\n\n0️⃣ Change language`;
}

/**
 * Returns true when the conversation engine handled this message
 * (caller should skip the regular keyword flow engine).
 */
async function handleConversation(contact, workspace, rawText) {
  const msg = (rawText || '').trim().toLowerCase();
  if (!msg) return false;

  // Only activate when there is an active smart_menu record
  const { data: smartMenu } = await supabase
    .from('smart_menus')
    .select('*')
    .eq('workspace_id', workspace.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!smartMenu) return false;

  const state = contact.menu_state         || '';
  const lang  = contact.preferred_language || 'english';
  const sfx   = langSuffix(lang);

  // ── Greeting → welcome + language picker ────────────────────────────────
  if (GREETINGS.has(msg)) {
    const gr   = timeGreeting();
    const name = contact.name && contact.name !== contact.phone ? ` ${contact.name}` : '';
    const biz  = smartMenu.business_name || workspace.name || 'us';

    const langs = smartMenu.languages || ['hindi', 'english', 'hinglish'];
    let langOpts = '';
    if (langs.includes('hindi'))    langOpts += '\n1️⃣ Hindi';
    if (langs.includes('english'))  langOpts += '\n2️⃣ English';
    if (langs.includes('hinglish')) langOpts += '\n3️⃣ Hinglish';

    const text = `Good ${gr}${name}! 👋\nWelcome to *${biz}*!${langOpts}`;
    await setContactState(contact.id, { menu_state: 'lang_select' });
    await sendAndRecord(workspace, contact, text);
    return true;
  }

  // ── Language selection ───────────────────────────────────────────────────
  if (state === 'lang_select' && LANG_MAP[msg]) {
    const chosenLang = LANG_MAP[msg];
    await setContactState(contact.id, { preferred_language: chosenLang, menu_state: 'main_menu' });
    const mainText = buildMainMenu(smartMenu, chosenLang);
    await sendAndRecord(workspace, { ...contact, preferred_language: chosenLang }, mainText);
    return true;
  }

  // ── Main menu → option reply ─────────────────────────────────────────────
  if (state === 'main_menu') {
    const optIdx = parseInt(msg, 10) - 1;
    const option = (smartMenu.options || [])[optIdx];

    if (option && optIdx >= 0) {
      const reply = option[`reply_${sfx}`] || option.reply_en || 'We will get back to you shortly.';
      await setContactState(contact.id, { menu_state: 'main_menu', last_menu_reply: msg });
      await sendAndRecord(workspace, contact, `${reply}\n\n0️⃣ Back to menu`);
      return true;
    }
  }

  // ── "0" → back to main menu ─────────────────────────────────────────────
  if (msg === '0' && state) {
    await setContactState(contact.id, { menu_state: 'main_menu' });
    await sendAndRecord(workspace, contact, buildMainMenu(smartMenu, lang));
    return true;
  }

  // ── "menu" / "back" / "restart" ─────────────────────────────────────────
  if (['menu', 'back', 'restart', 'main'].includes(msg) && state) {
    await setContactState(contact.id, { menu_state: 'main_menu' });
    await sendAndRecord(workspace, contact, buildMainMenu(smartMenu, lang));
    return true;
  }

  return false;
}

module.exports = { handleConversation };
