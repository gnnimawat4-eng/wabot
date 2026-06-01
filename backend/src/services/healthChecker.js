const { supabase } = require('./supabase');
const { logError }  = require('./errorLogger');

async function checkSupabase() {
  const start = Date.now();
  try {
    await supabase.from('workspaces').select('id').limit(1);
    return { service: 'supabase', status: 'operational', response_ms: Date.now() - start };
  } catch (e) {
    await logError(e, { source: 'supabase', route: 'health_check' });
    return { service: 'supabase', status: 'error', error_message: e.message };
  }
}

async function checkGroq() {
  if (!process.env.GROQ_API_KEY) {
    return { service: 'groq', status: 'unknown', error_message: 'GROQ_API_KEY not set' };
  }
  const start = Date.now();
  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    });
    return { service: 'groq', status: 'operational', response_ms: Date.now() - start };
  } catch (e) {
    await logError(e, { source: 'groq', route: 'health_check' });
    return { service: 'groq', status: 'error', error_message: e.message };
  }
}

async function checkResend() {
  if (!process.env.RESEND_API_KEY) {
    return { service: 'resend', status: 'unknown', error_message: 'RESEND_API_KEY not set' };
  }
  const start = Date.now();
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    return {
      service: 'resend',
      status: res.ok ? 'operational' : 'degraded',
      response_ms: Date.now() - start,
      error_message: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { service: 'resend', status: 'error', error_message: e.message };
  }
}

async function checkWhatsApp() {
  const start = Date.now();
  try {
    const res = await fetch('https://graph.facebook.com/v19.0/me', {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN || 'test'}` },
    });
    const data = await res.json();
    // Token expired = code 190; anything else means Meta's API itself is reachable
    const apiReachable = !data.error || data.error.code !== -1;
    return {
      service: 'whatsapp_api',
      status: apiReachable ? 'operational' : 'error',
      response_ms: Date.now() - start,
      error_message: data.error && data.error.code === 190 ? 'Token expired' : (data.error?.message ?? null),
    };
  } catch (e) {
    return { service: 'whatsapp_api', status: 'error', error_message: e.message };
  }
}

async function checkAllServices() {
  const results = await Promise.all([
    checkSupabase(),
    checkGroq(),
    checkResend(),
    checkWhatsApp(),
    Promise.resolve({ service: 'railway_backend', status: 'operational', response_ms: 0 }),
  ]);

  // Persist to service_checks (fire and forget individual rows so one failure doesn't block)
  await Promise.all(
    results.map((r) =>
      supabase.from('service_checks').insert({ ...r, checked_at: new Date().toISOString() }).catch(() => {})
    )
  );

  return results;
}

// Run on startup + every 5 minutes
checkAllServices().catch(console.error);
setInterval(() => checkAllServices().catch(console.error), 5 * 60 * 1000);

module.exports = { checkAllServices };
