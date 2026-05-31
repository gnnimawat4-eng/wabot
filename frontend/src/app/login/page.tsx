'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { useEffect } from 'react';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Show toast if redirected from verify-email
  useEffect(() => {
    if (params.get('verified') === '1') {
      toast.success('Email verified! Please sign in.');
    }
  }, [params]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      // Guide users to verify if that's the issue
      if (error.message.toLowerCase().includes('email not confirmed')) {
        toast.error('Please verify your email first.');
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        toast.error(error.message);
      }
    } else if (data.session) {
      router.push('/dashboard');
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
          <h2 className="text-base font-semibold text-white mb-5">Sign in to your account</h2>
          <form onSubmit={handleLogin} className="space-y-4">
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
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-white/60">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-white/30 hover:text-green-400 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-green-500/50"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-white/40">
            No account?{' '}
            <Link href="/signup" className="text-green-400 hover:text-green-300">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
