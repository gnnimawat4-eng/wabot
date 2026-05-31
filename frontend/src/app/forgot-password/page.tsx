'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Zap, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok && res.status === 429) {
        toast.error(data.error);
        return;
      }
      // Always succeed from the user's perspective (security: don't reveal existence)
      toast.success('Reset code sent! Check your inbox.');
      router.push(`/reset-password?email=${encodeURIComponent(email.trim())}`);
    } catch {
      toast.error('Network error. Please try again.');
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
          <h2 className="text-base font-semibold text-white mb-1">Forgot password?</h2>
          <p className="text-sm text-white/40 mb-5">
            Enter your email and we&apos;ll send a 6-digit reset code.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-white/60 mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-green-500/50"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
              disabled={loading}>
              {loading ? 'Sending…' : 'Send reset code'}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <Link
              href="/login"
              className="text-sm text-white/40 hover:text-white/60 flex items-center justify-center gap-1.5 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" />Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
