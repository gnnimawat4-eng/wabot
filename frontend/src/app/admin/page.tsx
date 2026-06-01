'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getAdminOverview, getAdminCustomers, getAdminRevenue,
  getAdminErrors, getAdminWorkspaces, toggleWorkspace,
} from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

const ADMIN_EMAIL = 'gnnimawat4@gmail.com';

type Tab = 'overview' | 'customers' | 'workspaces' | 'revenue' | 'errors';
type WsFilter = 'all' | 'active' | 'suspended';

interface AdminWorkspace {
  id: string;
  name: string;
  business_type: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  deactivated_reason: string | null;
  created_at: string;
  owner_email: string;
  contact_count: number;
  subscription: { plan?: string; status?: string; trial_ends_at?: string } | null;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  ws, onConfirm, onCancel, loading,
}: {
  ws: AdminWorkspace;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const isSuspending = ws.is_active;
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-[#1e1e1e] border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-white mb-1">
          {isSuspending ? 'Suspend workspace?' : 'Reactivate workspace?'}
        </p>
        <p className="text-sm text-white/40 mb-5">
          <span className="text-white/70 font-medium">{ws.name}</span>
          {isSuspending
            ? ' will no longer receive or process WhatsApp messages.'
            : ' will resume receiving WhatsApp messages immediately.'}
        </p>

        {isSuspending && (
          <div className="mb-5">
            <label className="text-xs text-white/40 mb-1 block">Reason (optional)</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Payment overdue, Terms violation…"
              className="w-full rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 ${
              isSuspending ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}>
            {loading ? '…' : isSuspending ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [wsFilter, setWsFilter] = useState<WsFilter>('all');
  const [confirmWs, setConfirmWs] = useState<AdminWorkspace | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      if (session.user.email !== ADMIN_EMAIL) { setAuthorized(false); return; }
      setAuthorized(true);
    });
  }, [router]);

  const { data: overview } = useQuery({
    queryKey: ['admin-overview'], queryFn: getAdminOverview,
    enabled: authorized === true, refetchInterval: 30_000,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['admin-customers'], queryFn: getAdminCustomers,
    enabled: authorized === true && tab === 'customers',
  });
  const { data: adminWorkspaces = [], isLoading: wsLoading } = useQuery<AdminWorkspace[]>({
    queryKey: ['admin-workspaces'], queryFn: getAdminWorkspaces,
    enabled: authorized === true && tab === 'workspaces',
    refetchOnWindowFocus: false,
  });
  const { data: revenue = [] } = useQuery({
    queryKey: ['admin-revenue'], queryFn: getAdminRevenue,
    enabled: authorized === true && tab === 'revenue',
  });
  const { data: errors = [] } = useQuery({
    queryKey: ['admin-errors'], queryFn: getAdminErrors,
    enabled: authorized === true && tab === 'errors', refetchInterval: 60_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => toggleWorkspace(id, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      setConfirmWs(null);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update workspace'),
  });

  if (authorized === null) return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white/30">Loading…</div>
  );
  if (authorized === false) return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">🚫</p>
        <p className="text-white text-lg font-semibold">Access Denied</p>
        <p className="text-white/40 text-sm mt-2">This page is restricted to admin users only.</p>
      </div>
    </div>
  );

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: 'overview',   label: 'Overview',   emoji: '📊' },
    { id: 'customers',  label: 'Customers',  emoji: '👥' },
    { id: 'workspaces', label: 'Workspaces', emoji: '🏢' },
    { id: 'revenue',    label: 'Revenue',    emoji: '💰' },
    { id: 'errors',     label: 'Errors',     emoji: '⚠️' },
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

  const filteredWs = adminWorkspaces.filter((w) => {
    if (wsFilter === 'active')    return w.is_active !== false;
    if (wsFilter === 'suspended') return w.is_active === false;
    return true;
  });

  const suspendedCount = adminWorkspaces.filter((w) => w.is_active === false).length;
  const activeCount    = adminWorkspaces.length - suspendedCount;

  return (
    <div className="min-h-screen bg-[#1e1e1e]">
      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-green-500/20 flex items-center justify-center">
          <Zap className="h-4 w-4 text-green-400" />
        </div>
        <span className="font-bold text-white">WaBot</span>
        <span className="text-white/30">·</span>
        <span className="text-white/50 text-sm">Super Admin</span>
      </header>

      <div className="p-6 max-w-7xl mx-auto">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit border border-white/8">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="Total Workspaces" value={overview?.totalWorkspaces ?? '—'} />
            <StatCard label="Active Subscriptions" value={overview?.activeSubscriptions ?? '—'} color="text-green-400" />
            <StatCard label="MRR" value={overview?.mrr ? `₹${(overview.mrr).toLocaleString('en-IN')}` : '₹0'} color="text-green-400" sub="Monthly Recurring Revenue" />
            <StatCard label="Trial Users" value={overview?.trialUsers ?? '—'} color="text-blue-400" />
            <StatCard label="Messages Today" value={overview?.messagesToday ?? '—'} />
          </div>
        )}

        {/* ── Customers ── */}
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

        {/* ── Workspaces (admin management) ── */}
        {tab === 'workspaces' && (
          <div>
            {/* Stats row */}
            <div className="flex gap-3 mb-4">
              <div className="rounded-lg bg-white/5 border border-white/8 px-4 py-2.5 text-sm">
                <span className="text-white/40 mr-2">Total</span>
                <span className="font-semibold text-white">{adminWorkspaces.length}</span>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-2.5 text-sm">
                <span className="text-green-400/70 mr-2">Active</span>
                <span className="font-semibold text-green-400">{activeCount}</span>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm">
                <span className="text-red-400/70 mr-2">Suspended</span>
                <span className="font-semibold text-red-400">{suspendedCount}</span>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex gap-1.5 mb-4">
              {(['all', 'active', 'suspended'] as WsFilter[]).map((f) => (
                <button key={f} onClick={() => setWsFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                    wsFilter === f ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'
                  }`}>
                  {f}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-white/8 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/3">
                    {['Workspace', 'Owner', 'Type', 'Contacts', 'Plan', 'WA Status', 'Created', 'Action'].map((h) => (
                      <th key={h} className="text-left text-xs text-white/40 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wsLoading && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-white/30 text-sm">Loading…</td></tr>
                  )}
                  {!wsLoading && filteredWs.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-white/30 text-sm">No workspaces</td></tr>
                  )}
                  {filteredWs.map((ws, i) => (
                    <tr key={ws.id}
                      className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.02]' : ''} ${ws.is_active === false ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{ws.name}</p>
                        {ws.is_active === false && ws.deactivated_reason && (
                          <p className="text-[10px] text-red-400/70 mt-0.5 max-w-[180px] truncate" title={ws.deactivated_reason}>
                            {ws.deactivated_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs max-w-[140px] truncate">{ws.owner_email}</td>
                      <td className="px-4 py-3 text-white/50 capitalize text-xs">{ws.business_type ?? '—'}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">{ws.contact_count}</td>
                      <td className="px-4 py-3 text-white/50 text-xs capitalize">{ws.subscription?.plan ?? '—'}</td>
                      <td className="px-4 py-3">
                        {ws.is_active !== false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />Active
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />Suspended
                            </span>
                            {ws.deactivated_at && (
                              <p className="text-[10px] text-white/25 mt-0.5">{timeAgo(ws.deactivated_at)}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{timeAgo(ws.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setConfirmWs(ws)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                            ws.is_active !== false
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                          }`}>
                          {ws.is_active !== false ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Revenue ── */}
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

        {/* ── Errors ── */}
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

      {/* Confirm dialog */}
      {confirmWs && (
        <ConfirmDialog
          ws={confirmWs}
          loading={toggleMut.isPending}
          onCancel={() => setConfirmWs(null)}
          onConfirm={(reason) => toggleMut.mutate({ id: confirmWs.id, reason })}
        />
      )}
    </div>
  );
}
