const { supabase } = require('./supabase');

async function logError(error, context = {}) {
  try {
    await supabase.from('error_logs').insert({
      message:      error?.message || String(error),
      stack:        error?.stack   || null,
      route:        context.route        || null,
      workspace_id: context.workspace_id || null,
      severity:     context.severity     || 'error',
      metadata:     context.metadata     || {},
    });
  } catch (e) {
    console.error('Failed to log error:', e?.message);
  }
}

module.exports = { logError };
