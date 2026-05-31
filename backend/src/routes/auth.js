const { supabase } = require('../services/supabase');
const { sendOTPEmail } = require('../services/emailService');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Look up an auth.users row by email via the SECURITY DEFINER helper function */
async function getAuthUserByEmail(email) {
  const { data, error } = await supabase.rpc('get_auth_user_by_email', { p_email: email });
  if (error || !data) return null;
  // rpc returns the json row directly
  return typeof data === 'string' ? JSON.parse(data) : data;
}

/** Invalidate all unused OTPs of the given type for this email */
async function invalidatePreviousOTPs(email, type) {
  await supabase.from('user_otps')
    .update({ used: true })
    .eq('email', email)
    .eq('type', type)
    .eq('used', false);
}

/** Check rate limit: returns wait_seconds (>0) if too soon, 0 if ok */
async function getRateLimitWait(email, type) {
  const { data } = await supabase
    .from('user_otps')
    .select('resend_at')
    .eq('email', email)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.resend_at) return 0;
  const ms = Date.now() - new Date(data.resend_at).getTime();
  return ms < 60_000 ? Math.ceil((60_000 - ms) / 1000) : 0;
}

module.exports = async function authRoutes(fastify) {

  // ── POST /auth/send-verification  { email } ──────────────────────────────
  // Public endpoint — called right after signup before the user has a session
  fastify.post('/send-verification', async (req, reply) => {
    const { email } = req.body || {};
    if (!email) return reply.code(400).send({ error: 'Email is required' });

    const user = await getAuthUserByEmail(email);
    // Don't reveal whether the email exists
    if (!user) return reply.send({ message: 'If this email exists, OTP has been sent' });
    if (user.email_confirmed_at) return reply.code(400).send({ error: 'Email is already verified' });

    const wait = await getRateLimitWait(email, 'verify');
    if (wait > 0) return reply.code(429).send({ error: `Wait ${wait} seconds before resending` });

    const otp = generateOTP();
    await invalidatePreviousOTPs(email, 'verify');
    const { error: insertErr } = await supabase.from('user_otps').insert({
      user_id:    user.id,
      email,
      otp,
      type:       'verify',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      resend_at:  new Date().toISOString(),
    });
    if (insertErr) {
      console.error('OTP insert error:', insertErr.message);
      return reply.code(500).send({ error: 'Failed to generate OTP' });
    }

    try {
      await sendOTPEmail(email, otp, 'verify');
    } catch (err) {
      console.error('Email send error:', err.message);
      return reply.code(500).send({ error: 'Failed to send email. Please try again.' });
    }

    return { message: 'OTP sent', email };
  });

  // ── POST /auth/verify-email  { email, otp } ──────────────────────────────
  fastify.post('/verify-email', async (req, reply) => {
    const { email, otp } = req.body || {};
    if (!email || !otp) return reply.code(400).send({ error: 'Email and OTP are required' });

    const { data: record, error } = await supabase
      .from('user_otps')
      .select('*')
      .eq('email', email)
      .eq('type', 'verify')
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !record || record.otp !== otp) {
      return reply.code(400).send({ error: 'Invalid or expired code' });
    }
    if (new Date() > new Date(record.expires_at)) {
      return reply.code(400).send({ error: 'Code expired. Please request a new one.' });
    }

    await supabase.from('user_otps').update({ used: true }).eq('id', record.id);

    // Confirm email in Supabase Auth via admin API
    const { error: adminErr } = await supabase.auth.admin.updateUserById(record.user_id, {
      email_confirm: true,
    });
    if (adminErr) {
      console.error('Admin confirm error:', adminErr.message);
      return reply.code(500).send({ error: 'Failed to verify email. Please contact support.' });
    }

    return { message: 'Email verified successfully' };
  });

  // ── POST /auth/forgot-password  { email } ────────────────────────────────
  fastify.post('/forgot-password', async (req, reply) => {
    const { email } = req.body || {};
    if (!email) return reply.code(400).send({ error: 'Email is required' });

    const ok = { message: 'If this email exists, a reset code has been sent' };

    const user = await getAuthUserByEmail(email);
    if (!user) return reply.send(ok); // don't reveal

    const wait = await getRateLimitWait(email, 'reset');
    if (wait > 0) return reply.code(429).send({ error: `Wait ${wait} seconds before resending` });

    const otp = generateOTP();
    await invalidatePreviousOTPs(email, 'reset');
    await supabase.from('user_otps').insert({
      user_id:    user.id,
      email,
      otp,
      type:       'reset',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      resend_at:  new Date().toISOString(),
    });

    try {
      await sendOTPEmail(email, otp, 'reset');
    } catch (err) {
      console.error('Reset email error:', err.message);
      // Return success anyway — don't reveal internal errors for forgot-password
    }

    return ok;
  });

  // ── POST /auth/reset-password  { email, otp, newPassword } ──────────────
  fastify.post('/reset-password', async (req, reply) => {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return reply.code(400).send({ error: 'Email, OTP and new password are required' });
    }
    if (newPassword.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const { data: record, error } = await supabase
      .from('user_otps')
      .select('*')
      .eq('email', email)
      .eq('type', 'reset')
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !record || record.otp !== otp) {
      return reply.code(400).send({ error: 'Invalid or expired code' });
    }
    if (new Date() > new Date(record.expires_at)) {
      return reply.code(400).send({ error: 'Code expired. Please request a new one.' });
    }

    await supabase.from('user_otps').update({ used: true }).eq('id', record.id);

    const { error: adminErr } = await supabase.auth.admin.updateUserById(record.user_id, {
      password: newPassword,
    });
    if (adminErr) {
      console.error('Password reset error:', adminErr.message);
      return reply.code(500).send({ error: 'Failed to reset password. Please try again.' });
    }

    return { message: 'Password reset successfully' };
  });
};
