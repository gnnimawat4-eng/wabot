'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Zap, LogOut } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start countdown and send initial OTP on mount
  useEffect(() => {
    if (!email) return;
    sendOTP();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const sendOTP = useCallback(async () => {
    if (!email) return;
    try {
      const res = await fetch(`${API}/auth/send-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          toast.error(data.error);
          // parse the wait seconds and start countdown
          const match = (data.error as string).match(/(\d+)/);
          if (match) setCountdown(parseInt(match[1]));
        } else if (res.status === 400 && data.error?.includes('already verified')) {
          toast.success('Email already verified! Please sign in.');
          router.push('/login');
        } else {
          toast.error(data.error || 'Failed to send OTP');
        }
        return;
      }
      setCountdown(60);
    } catch {
      toast.error('Network error. Please try again.');
    }
  }, [email, router]);

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

  const handleChange = (index: number, value: string) => {
    // Allow only digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');

    if (digit && index < 5) focusInput(index + 1);

    // Auto-submit when all filled
    if (digit && index === 5 && next.every((d) => d !== '')) {
      verify(next.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        focusInput(index - 1);
      }
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
    if (pasted.length === 6) verify(pasted);
    else focusInput(Math.min(pasted.length, 5));
  };

  const verify = async (otp: string) => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid or expired code');
        setDigits(['', '', '', '', '', '']);
        focusInput(0);
        return;
      }
      toast.success('Email verified! Please sign in.');
      router.push('/login?verified=1');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const otp = digits.join('');
    if (otp.length < 6) { setError('Enter all 6 digits'); return; }
    verify(otp);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
        <p className="text-white/40 text-sm">Missing email — <Link href="/signup" className="text-green-400">sign up</Link></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1e1e1e]">
      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-green-500/20 mb-4">
            <Zap className="h-6 w-6 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">WaBot</h1>
          <p className="text-sm text-white/40 mt-1">WhatsApp automation for Indian SMEs</p>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/8 p-6">
          <h2 className="text-base font-semibold text-white mb-1">Check your inbox</h2>
          <p className="text-sm text-white/40 mb-6">
            We sent a 6-digit code to <span className="text-white/70 font-medium">{maskEmail(email)}</span>
          </p>

          <form onSubmit={handleSubmit}>
            {/* 6-box OTP input */}
            <div className="flex gap-2 justify-center mb-5" onPaste={handlePaste}>
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
                    borderColor: error ? '#ef4444' : d ? '#22c55e' : 'rgba(255,255,255,0.12)',
                    boxShadow: d ? '0 0 0 1px rgba(34,197,94,0.3)' : undefined,
                  }}
                />
              ))}
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center mb-4">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || digits.some((d) => !d)}
              className="w-full py-2.5 rounded-xl font-medium text-sm text-white transition-opacity disabled:opacity-40"
              style={{ background: '#16a34a' }}>
              {loading ? 'Verifying…' : 'Verify email'}
            </button>
          </form>

          {/* Resend */}
          <div className="mt-5 text-center">
            {countdown > 0 ? (
              <p className="text-sm text-white/30">
                Resend in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
              </p>
            ) : (
              <button
                onClick={sendOTP}
                className="text-sm text-green-400 hover:text-green-300 transition-colors">
                Resend code
              </button>
            )}
          </div>

          {/* Sign out */}
          <div className="mt-4 text-center">
            <button
              onClick={handleSignOut}
              className="text-xs text-white/25 hover:text-white/50 flex items-center gap-1.5 mx-auto transition-colors">
              <LogOut className="h-3 w-3" />Wrong email? Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
