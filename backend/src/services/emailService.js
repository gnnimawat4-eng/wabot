const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTPEmail(toEmail, otp, type = 'verify') {
  const isVerify = type === 'verify';
  const subject = isVerify ? 'WaBot — Verify your email' : 'WaBot — Reset your password';
  const heading = isVerify ? 'Verify your email' : 'Reset your password';
  const subtext = isVerify
    ? 'Enter this code to complete your signup'
    : 'Enter this code to reset your password';

  const { error } = await resend.emails.send({
    from: 'WaBot <onboarding@resend.dev>',
    to: toEmail,
    subject,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#185FA5;padding:28px 32px">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600">WaBot</h1>
          <p style="margin:4px 0 0;color:#B5D4F4;font-size:13px">WhatsApp Automation Platform</p>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:20px">${heading}</h2>
          <p style="margin:0 0 28px;color:#666;font-size:14px">${subtext}</p>
          <div style="background:#f8f8f8;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px">
            <p style="margin:0 0 8px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:2px">Your code</p>
            <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:12px;color:#185FA5">${otp}</p>
          </div>
          <p style="margin:0 0 6px;color:#888;font-size:13px">⏱ This code expires in <strong>10 minutes</strong></p>
          <p style="margin:0;color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
        </td></tr>
        <tr><td style="background:#f8f8f8;padding:16px 32px;text-align:center">
          <p style="margin:0;color:#aaa;font-size:12px">© 2025 WaBot. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) throw new Error(error.message || 'Failed to send email');
}

module.exports = { sendOTPEmail };
