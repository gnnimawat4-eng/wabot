'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Zap, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const resendOTP = useCallback(async () => {
    if (!email) return;
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok && res.status === 429) {
        toast.error(data.error);
        const match = (data.error as string).match(/(\d+)/);
        if (match) setCountdown(parseInt(match[1]));
        return;
      }
      toast.success('New code sent');
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
    } catch {
      toast.error('Network error');
    }
  }, [email]);

  const focusInput = (i: number) => inputRefs.current[i]?.focus();

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');
    if (digit && index < 5) focusInput(index + 1);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits]; next[index] = ''; setDigits(next);
      } else if (index > 0) { focusInput(index - 1); }
    }
    if (e.key === 'ArrowLeft' && index > 0) focusInput(index - 1);
    if (e.key === 'ArrowRight' && index < 5) focusInput(index + 1);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? '';
    setDigits(next);
    focusInput(Math.min(pasted.length, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < 6) { setError('Enter the 6-digit code'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to reset password');
        if (data.error?.includes('expired') || data.error?.includes('Invalid')) {
          setDigits(['', '', '', '', '', '']);
          focusInput(0);
        }
        return;
      }
      toast.success('Password reset! Please sign in.');
      router.push('/login');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-green-500/20 mb-4">
            <Zap className="h-6 w-6 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">WaBot</h1>
          <p className="text-sm text-white/40 mt-1">WhatsApp automation for Indian SMEs</p>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/8 p-6">
          <h2 className="text-base font-semibold text-white mb-1">Reset password</h2>
          {email && (
            <p className="text-sm text-white/40 mb-5">
              Enter the code sent to <span className="text-white/70 font-medium">{maskEmail(email)}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* OTP boxes */}
            <div>
              <label className="text-sm font-medium text-white/60 mb-2 block">Reset code</label>
              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    autoFocus={i === 0}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-11 h-14 text-center text-xl font-bold rounded-xl border bg-white/5 text-white outline-none transition-all"
                    style={{
                      borderColor: error && !d ? '#ef4444' : d ? '#22c55e' : 'rgba(255,255,255,0.12)',
                      boxShadow: d ? '0 0 0 1px rgba(34,197,94,0.3)' : undefined,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="text-sm font-medium text-white/60 mb-1 block">New password</label>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-green-500/50 pr-10"
                  required
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="text-sm font-medium text-white/60 mb-1 block">Confirm password</label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Same as above"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-green-500/50 pr-10"
                  required
                />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
              )}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
              disabled={loading}>
              {loading ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>

          {/* Resend */}
          <div className="mt-4 text-center">
            {countdown > 0 ? (
              <p className="text-xs text-white/30">
                Resend in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
              </p>
            ) : (
              <button onClick={resendOTP} className="text-xs text-green-400 hover:text-green-300 transition-colors">
                Resend code
              </button>
            )}
          </div>

          <div className="mt-3 text-center">
            <Link href="/login" className="text-xs text-white/25 hover:text-white/50 flex items-center justify-center gap-1 transition-colors">
              <ArrowLeft className="h-3 w-3" />Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}
