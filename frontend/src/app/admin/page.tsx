'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getAdminOverview, getAdminCustomers, getAdminRevenue, getAdminErrors } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

const ADMIN_EMAIL = 'gnnimawat4@gmail.com';

type Tab = 'overview' | 'customers' | 'revenue' | 'errors';

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      if (session.user.email !== ADMIN_EMAIL) { setAuthorized(false); return; }
      setAuthorized(true);
    });
  }, [router]);

  const { data: overview } = useQuery({ queryKey: ['admin-overview'], queryFn: getAdminOverview, enabled: authorized === true, refetchInterval: 30_000 });
  const { data: customers = [] } = useQuery({ queryKey: ['admin-customers'], queryFn: getAdminCustomers, enabled: authorized === true && tab === 'customers' });
  const { data: revenue = [] } = useQuery({ queryKey: ['admin-revenue'], queryFn: getAdminRevenue, enabled: authorized === true && tab === 'revenue' });
  const { data: errors = [] } = useQuery({ queryKey: ['admin-errors'], queryFn: getAdminErrors, enabled: authorized === true && tab === 'errors', refetchInterval: 60_000 });

  if (authorized === null) return <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-white/30">Loading…</div>;
  if (authorized === false) return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">🚫</p>
        <p className="text-white text-lg font-semibold">Access Denied</p>
        <p className="text-white/40 text-sm mt-2">This page is restricted to admin users only.</p>
      </div>
    </div>
  );

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: 'overview', label: 'Overview', emoji: '📊' },
    { id: 'customers', label: 'Customers', emoji: '👥' },
    { id: 'revenue', label: 'Revenue', emoji: '💰' },
    { id: 'errors', label: 'Errors', emoji: '⚠️' },
  ];

  const badgeFor = (status: string) => {
    const map: Record<string, string> = {
      trial: 'bg-blue-500/15 text-blue-400',
      active: 'bg-green-500/15 text-green-400',
      pending_payment: 'bg-yellow-500/15 text-yellow-400',
      cancelled: 'bg-red-500/15 text-red-400',
    };
    return map[status] ?? 'bg-white/10 text-white/50';
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-green-500/20 flex items-center justify-center">
          <Zap className="h-4 w-4 text-green-400" />
        </div>
        <span className="font-bold text-white">WaBot</span>
        <span className="text-white/30">·</span>
        <span className="text-white/50 text-sm">Super Admin</span>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit border border-white/8">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'overview' && (
          <div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <StatCard label="Total Workspaces" value={overview?.totalWorkspaces ?? '—'} />
              <StatCard label="Active Subscriptions" value={overview?.activeSubscriptions ?? '—'} color="text-green-400" />
              <StatCard label="MRR" value={overview?.mrr ? `₹${(overview.mrr).toLocaleString('en-IN')}` : '₹0'} color="text-green-400" sub="Monthly Recurring Revenue" />
              <StatCard label="Trial Users" value={overview?.trialUsers ?? '—'} color="text-blue-400" />
              <StatCard label="Messages Today" value={overview?.messagesToday ?? '—'} />
            </div>
          </div>
        )}

        {/* Customers */}
        {tab === 'customers' && (
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  {['Workspace', 'Business Type', 'Plan', 'Status', 'Trial Ends', 'Joined'].map((h) => (
                    <th key={h} className="text-left text-xs text-white/40 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(customers as Array<{ id: string; name: string; business_type?: string; created_at: string; subscription?: { plan?: string; status?: string; trial_ends_at?: string } }>).map((c, i) => (
                  <tr key={c.id} className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-white/50 capitalize">{c.business_type ?? '—'}</td>
                    <td className="px-4 py-3 text-white/70 capitalize">{c.subscription?.plan ?? 'none'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeFor(c.subscription?.status ?? '')}`}>
                        {c.subscription?.status ?? 'none'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {c.subscription?.trial_ends_at ? new Date(c.subscription.trial_ends_at).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">{timeAgo(c.created_at)}</td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-white/30 text-sm">No customers yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Revenue */}
        {tab === 'revenue' && (
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  {['Plan', 'Amount', 'Period Start', 'Period End', 'Payment ID'].map((h) => (
                    <th key={h} className="text-left text-xs text-white/40 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(revenue as Array<{ id: string; plan: string; amount: number; current_period_start?: string; current_period_end?: string; razorpay_payment_id?: string }>).map((r, i) => (
                  <tr key={r.id} className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                    <td className="px-4 py-3 font-medium text-white capitalize">{r.plan}</td>
                    <td className="px-4 py-3 text-green-400 font-semibold">₹{r.amount?.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{r.current_period_start ? new Date(r.current_period_start).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-4 py-3 text-white/50 text-xs">{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="px-4 py-3 text-white/30 text-xs font-mono">{r.razorpay_payment_id?.slice(0, 20) ?? '—'}</td>
                  </tr>
                ))}
                {revenue.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-white/30 text-sm">No payments yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Errors */}
        {tab === 'errors' && (
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 bg-white/3">
                  {['Message', 'Status', 'Time'].map((h) => (
                    <th key={h} className="text-left text-xs text-white/40 font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(errors as Array<{ id: string; body: string; status: string; created_at: string }>).map((e, i) => (
                  <tr key={e.id} className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                    <td className="px-4 py-3 text-white/70 max-w-xs truncate">{e.body}</td>
                    <td className="px-4 py-3"><span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded-full">{e.status}</span></td>
                    <td className="px-4 py-3 text-white/40 text-xs">{timeAgo(e.created_at)}</td>
                  </tr>
                ))}
                {errors.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-white/30 text-sm">No errors 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
