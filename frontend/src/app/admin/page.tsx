'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Zap, RefreshCw, X, CheckCircle, AlertCircle, Search, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getAdminAnalytics, getAdminWorkspaces, getAdminWorkspaceDetails,
  getAdminErrorLogs, getHealthStatus, toggleWorkspace,
} from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

const ADMIN_EMAIL = 'gnnimawat4@gmail.com';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = { blue: '#185FA5', green: '#1D9E75', amber: '#BA7517', red: '#A32D2D', purple: '#534AB7' };
const PIE_COLORS = [C.blue, C.green, C.amber, C.red, C.purple, '#888'];

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'analytics' | 'workspaces' | 'system';
type WsFilter = 'all' | 'active' | 'suspended';

interface AdminWorkspace {
  id: string; name: string; business_type: string | null;
  is_active: boolean; deactivated_at: string | null; deactivated_reason: string | null;
  created_at: string; owner_email: string; contact_count: number;
  message_count: number; last_active: string | null;
  subscription: { plan?: string; status?: string } | null;
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function Skeleton({ h = 'h-6', w = 'w-full' }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} rounded animate-pulse`} style={{ background: 'rgba(255,255,255,0.06)' }} />;
}

function StatCard({ label, value, sub, color, loading }: { label: string; value: string | number; sub?: string; color?: string; loading?: boolean }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5">
      <p className="text-xs text-white/40 mb-1">{label}</p>
      {loading ? <Skeleton h="h-7" w="w-24" /> : <p className="text-2xl font-bold" style={{ color: color ?? '#fff' }}>{value}</p>}
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

// ── Suspend / Activate confirm dialog ─────────────────────────────────────────
function ConfirmDialog({ ws, onConfirm, onCancel, loading }: {
  ws: AdminWorkspace; onConfirm: (r: string) => void; onCancel: () => void; loading: boolean;
}) {
  const [reason, setReason] = useState('');
  const isSuspending = ws.is_active;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] border border-white/10 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-white mb-1">{isSuspending ? 'Suspend workspace?' : 'Reactivate workspace?'}</p>
        <p className="text-sm text-white/40 mb-5">
          <span className="text-white/70 font-medium">{ws.name}</span>
          {isSuspending ? ' will stop receiving WhatsApp messages.' : ' will resume immediately.'}
        </p>
        {isSuspending && (
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)" className="w-full mb-5 rounded-lg px-3 py-2 text-sm bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none resize-none" />
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => onConfirm(reason)} disabled={loading}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40 ${isSuspending ? 'bg-red-700 hover:bg-red-800' : 'bg-green-700 hover:bg-green-800'}`}>
            {loading ? '…' : isSuspending ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Workspace detail drawer ───────────────────────────────────────────────────
function WorkspaceDrawer({ wsId, onClose, onToggle }: { wsId: string; onClose: () => void; onToggle: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-ws-detail', wsId],
    queryFn: () => getAdminWorkspaceDetails(wsId),
    staleTime: 30_000,
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md h-full overflow-y-auto bg-[#161616] border-l border-white/10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 sticky top-0 bg-[#161616] z-10">
          <p className="font-semibold text-white text-sm">Workspace Details</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors"><X className="h-4 w-4" /></button>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} h="h-16" />)}</div>
        ) : data ? (
          <div className="p-5 space-y-5">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <p className="text-lg font-bold text-white">{data.workspace.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${data.workspace.is_active !== false ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {data.workspace.is_active !== false ? 'Active' : 'Suspended'}
                </span>
              </div>
              <p className="text-xs text-white/40 capitalize">{data.workspace.business_type ?? 'General'} · Created {timeAgo(data.workspace.created_at)}</p>
            </div>

            {/* Owner */}
            <Section title="Owner">
              <Row label="Email" value={data.owner.email} />
              <Row label="Joined" value={data.owner.created_at ? timeAgo(data.owner.created_at) : '—'} />
            </Section>

            {/* Stats */}
            <Section title="Stats">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Messages', value: data.stats.messages },
                  { label: 'Contacts', value: data.stats.contacts },
                  { label: 'Flows', value: data.stats.flows },
                  { label: 'Broadcasts', value: data.stats.broadcasts },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-3 bg-white/5">
                    <p className="text-xs text-white/40">{s.label}</p>
                    <p className="text-lg font-bold text-white">{s.value}</p>
                  </div>
                ))}
              </div>
            </Section>

            {/* WhatsApp */}
            <Section title="WhatsApp Connection">
              <Row label="Status" value={data.workspace.phone_number_id ? '✅ Connected' : '❌ Not connected'} />
              {data.workspace.phone_number && <Row label="Number" value={data.workspace.phone_number} />}
              {data.workspace.upi_id && <Row label="UPI ID" value={data.workspace.upi_id} />}
            </Section>

            {/* Subscription */}
            <Section title="Subscription">
              <Row label="Plan" value={data.subscription?.plan ?? 'None'} />
              <Row label="Status" value={data.subscription?.status ?? '—'} />
            </Section>

            {/* Recent messages */}
            {data.recent_messages?.length > 0 && (
              <Section title="Recent Messages">
                <div className="space-y-2">
                  {data.recent_messages.map((m: { body: string; direction: string; created_at: string }, i: number) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                        style={{ background: m.direction === 'inbound' ? 'rgba(24,95,165,0.15)' : 'rgba(29,158,117,0.15)', color: m.direction === 'inbound' ? C.blue : C.green }}>
                        {m.direction === 'inbound' ? '←' : '→'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-white/70 truncate">{m.body || '(media)'}</p>
                        <p className="text-[10px] text-white/30">{timeAgo(m.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.workspace.deactivated_reason && (
              <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: 'rgba(163,45,45,0.1)', border: '1px solid rgba(163,45,45,0.25)', color: '#f87171' }}>
                Suspended: {data.workspace.deactivated_reason}
              </div>
            )}

            <button onClick={onToggle}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${data.workspace.is_active !== false ? 'bg-red-700/80 hover:bg-red-700' : 'bg-green-700/80 hover:bg-green-700'}`}>
              {data.workspace.is_active !== false ? 'Suspend Workspace' : 'Activate Workspace'}
            </button>
          </div>
        ) : (
          <div className="p-5 text-white/30 text-sm">Failed to load workspace details</div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">{title}</p>
      <div className="rounded-xl bg-white/5 divide-y divide-white/5 overflow-hidden">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-xs text-white/80 font-medium">{value}</span>
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: getAdminAnalytics,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* Daily charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/5 border border-white/8 p-4">
          <p className="text-xs text-white/40 mb-3">New Signups — Last 30 days</p>
          {isLoading ? <Skeleton h="h-40" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data?.new_users_last_30_days ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke={C.blue} strokeWidth={2} dot={false} name="Signups" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl bg-white/5 border border-white/8 p-4">
          <p className="text-xs text-white/40 mb-3">Messages Sent — Last 30 days</p>
          {isLoading ? <Skeleton h="h-40" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data?.messages_last_30_days ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="count" fill={C.green} radius={[2, 2, 0, 0]} name="Messages" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Pie + Top workspaces */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/5 border border-white/8 p-4">
          <p className="text-xs text-white/40 mb-3">Business Type Breakdown</p>
          {isLoading ? <Skeleton h="h-40" /> : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={data?.business_type_breakdown ?? []} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={60}
                  label={(props) => { const p = props as { name?: string; percent?: number }; return `${p.name ?? ''} ${((p.percent ?? 0) * 100).toFixed(0)}%`; }}
                  labelLine={false} style={{ fontSize: 9, fill: 'rgba(255,255,255,0.6)' }}>
                  {(data?.business_type_breakdown ?? []).map((_: unknown, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl bg-white/5 border border-white/8 p-4">
          <p className="text-xs text-white/40 mb-3">Top 5 Workspaces by Messages</p>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} h="h-8" />)}</div>
          ) : (
            <div className="space-y-2">
              {(data?.top_workspaces ?? []).map((ws: { id: string; name: string; message_count: number; owner_email: string }, i: number) => (
                <div key={ws.id} className="flex items-center gap-3">
                  <span className="text-xs text-white/30 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{ws.name}</p>
                    <p className="text-[10px] text-white/30 truncate">{ws.owner_email}</p>
                  </div>
                  <span className="text-xs font-semibold text-white/60 shrink-0">{ws.message_count.toLocaleString()}</span>
                </div>
              ))}
              {(data?.top_workspaces ?? []).length === 0 && <p className="text-xs text-white/30 py-4 text-center">No data yet</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Workspaces tab ────────────────────────────────────────────────────────────
function WorkspacesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WsFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmWs, setConfirmWs] = useState<AdminWorkspace | null>(null);

  const { data: workspaces = [], isLoading, refetch } = useQuery<AdminWorkspace[]>({
    queryKey: ['admin-workspaces'],
    queryFn: getAdminWorkspaces,
    staleTime: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => toggleWorkspace(id, reason),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-ws-detail', confirmWs?.id ?? selectedId] });
      setConfirmWs(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const types = useMemo(() => {
    const seen = new Set(workspaces.map((w) => w.business_type ?? 'other'));
    return ['all', ...Array.from(seen)];
  }, [workspaces]);

  const filtered = useMemo(() => workspaces.filter((w) => {
    if (statusFilter === 'active'    && w.is_active === false) return false;
    if (statusFilter === 'suspended' && w.is_active !== false) return false;
    if (typeFilter !== 'all' && (w.business_type ?? 'other') !== typeFilter) return false;
    const q = search.toLowerCase();
    if (q && !w.name.toLowerCase().includes(q) && !w.owner_email.toLowerCase().includes(q)) return false;
    return true;
  }), [workspaces, statusFilter, typeFilter, search]);

  const handleToggleFromDrawer = () => {
    const ws = workspaces.find(w => w.id === selectedId);
    if (ws) setConfirmWs(ws);
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/25" />
        </div>
        {(['all', 'active', 'suspended'] as WsFilter[]).map((f) => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === f ? 'bg-white/15 text-white' : 'bg-white/5 text-white/40 hover:text-white/70'}`}>
            {f}
          </button>
        ))}
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/5 border border-white/10 text-white/60 capitalize focus:outline-none">
          {types.map((t) => <option key={t} value={t} className="bg-[#1e1e1e]">{t === 'all' ? 'All types' : t}</option>)}
        </select>
        <button onClick={() => refetch()} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 transition-colors" title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/3">
              {['Workspace', 'Owner', 'Messages', 'Contacts', 'Status', 'Last Active', 'Action'].map((h) => (
                <th key={h} className="text-left text-xs text-white/40 font-medium px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && [1,2,3,4,5].map(i => (
              <tr key={i} className="border-b border-white/5">
                {[1,2,3,4,5,6,7].map(j => <td key={j} className="px-4 py-3"><Skeleton h="h-4" w="w-20" /></td>)}
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-white/30 text-sm">No workspaces match filters</td></tr>
            )}
            {filtered.map((ws, i) => (
              <tr key={ws.id}
                onClick={() => setSelectedId(ws.id)}
                className={`border-b border-white/5 last:border-0 cursor-pointer transition-colors hover:bg-white/[0.03] ${i % 2 ? 'bg-white/[0.015]' : ''} ${ws.is_active === false ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium text-white text-xs">{ws.name}</p>
                      <span className="text-[10px] text-white/35 capitalize">{ws.business_type ?? 'general'}</span>
                    </div>
                    <ChevronRight className="h-3 w-3 text-white/20 ml-1" />
                  </div>
                </td>
                <td className="px-4 py-3 text-white/50 text-xs max-w-[140px] truncate">{ws.owner_email}</td>
                <td className="px-4 py-3 text-white/60 text-xs">{ws.message_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-white/60 text-xs">{ws.contact_count.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {ws.is_active !== false
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">Active</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">Suspended</span>}
                </td>
                <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                  {ws.last_active ? timeAgo(ws.last_active) : '—'}
                </td>
                <td className="px-4 py-3">
                  <button onClick={(e) => { e.stopPropagation(); setConfirmWs(ws); }}
                    className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${ws.is_active !== false ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'}`}>
                    {ws.is_active !== false ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <WorkspaceDrawer wsId={selectedId} onClose={() => setSelectedId(null)} onToggle={handleToggleFromDrawer} />
      )}
      {confirmWs && (
        <ConfirmDialog ws={confirmWs} loading={toggleMut.isPending}
          onCancel={() => setConfirmWs(null)}
          onConfirm={(reason) => toggleMut.mutate({ id: confirmWs.id, reason })} />
      )}
    </div>
  );
}

// ── System Health tab ─────────────────────────────────────────────────────────
function SystemHealthTab() {
  const { data: health, isLoading: hLoading, dataUpdatedAt, refetch: refetchHealth } = useQuery({
    queryKey: ['admin-health'],
    queryFn: getHealthStatus,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: errorLogs = [], isLoading: elLoading } = useQuery({
    queryKey: ['admin-error-logs'],
    queryFn: getAdminErrorLogs,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const isApiOk = !!health;
  const isDbOk  = health?.database?.status === 'ok';

  const StatusCard = ({ title, ok, detail, sub }: { title: string; ok: boolean | null; detail: string; sub?: string }) => (
    <div className="rounded-xl bg-white/5 border border-white/8 p-4">
      <div className="flex items-center gap-2 mb-2">
        {ok === null ? <div className="h-4 w-4 rounded-full bg-white/20 animate-pulse" />
          : ok ? <CheckCircle className="h-4 w-4 text-green-400" />
          : <AlertCircle className="h-4 w-4 text-red-400" />}
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      <p className="text-xs font-medium" style={{ color: ok ? C.green : ok === null ? '#666' : C.red }}>
        {hLoading ? '…' : detail}
      </p>
      {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatusCard title="API Server" ok={isApiOk}
          detail={isApiOk ? 'Operational' : 'Unreachable'}
          sub={health ? `Uptime: ${Math.floor((health.uptime ?? 0) / 3600)}h ${Math.floor(((health.uptime ?? 0) % 3600) / 60)}m` : undefined} />
        <StatusCard title="Database" ok={hLoading ? null : isDbOk}
          detail={isDbOk ? `Connected` : 'Error'}
          sub={health?.database?.response_ms != null ? `${health.database.response_ms} ms response` : undefined} />
        <StatusCard title="WhatsApp Webhook" ok={isApiOk}
          detail={isApiOk ? 'Active' : '—'}
          sub={health != null ? `${health.webhooks_today ?? 0} messages today` : undefined} />
        <StatusCard title="Email (Resend)" ok={hLoading ? null : (health?.email_configured ?? false)}
          detail={health?.email_configured ? 'Configured' : 'API key missing'}
          sub={dataUpdatedAt > 0 ? `Checked ${timeAgo(new Date(dataUpdatedAt).toISOString())}` : undefined} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Error Log (last 50)</p>
        <button onClick={() => refetchHealth()} className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="rounded-xl border border-white/8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/3">
              {['Time', 'Severity', 'Route', 'Message'].map((h) => (
                <th key={h} className="text-left text-xs text-white/40 font-medium px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {elLoading && [1,2,3].map(i => (
              <tr key={i} className="border-b border-white/5">
                {[1,2,3,4].map(j => <td key={j} className="px-4 py-3"><Skeleton h="h-4" w="w-24" /></td>)}
              </tr>
            ))}
            {!elLoading && (errorLogs as Array<{ id: string; created_at: string; severity: string; route: string; message: string }>).map((e, i) => (
              <tr key={e.id} className={`border-b border-white/5 last:border-0 ${i % 2 ? 'bg-white/[0.015]' : ''}`}>
                <td className="px-4 py-2.5 text-xs text-white/40 whitespace-nowrap">{timeAgo(e.created_at)}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={e.severity === 'error' ? { background: 'rgba(163,45,45,0.15)', color: '#f87171' } : { background: 'rgba(186,117,23,0.15)', color: '#fbbf24' }}>
                    {e.severity}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-white/40 font-mono">{e.route ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-white/60 max-w-xs truncate">{e.message}</td>
              </tr>
            ))}
            {!elLoading && (errorLogs as unknown[]).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-white/30 text-sm">No errors logged 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main admin page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('analytics');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return; }
      if (session.user.email !== ADMIN_EMAIL) { setAuthorized(false); return; }
      setAuthorized(true);
    });
  }, [router]);

  // Top-level stats (always visible)
  const { data: analytics, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: getAdminAnalytics,
    enabled: authorized === true,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });

  if (authorized === null) return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white/30">Loading…</div>
  );
  if (authorized === false) return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center">
      <div className="text-center"><p className="text-6xl mb-4">🚫</p>
        <p className="text-white text-lg font-semibold">Access Denied</p>
        <p className="text-white/40 text-sm mt-2">Admin only.</p>
      </div>
    </div>
  );

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: 'analytics',  label: 'Analytics',    emoji: '📊' },
    { id: 'workspaces', label: 'Workspaces',    emoji: '🏢' },
    { id: 'system',     label: 'System Health', emoji: '🛡️' },
  ];

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
        {/* Top 4 stat cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Users"        value={analytics?.total_users     ?? '—'} loading={statsLoading} />
          <StatCard label="Active Workspaces"  value={analytics?.active_workspaces ?? '—'} color={C.green} loading={statsLoading} sub={`${analytics?.new_users_today ?? 0} new today`} />
          <StatCard label="Total Messages"     value={analytics?.total_messages   ?? '—'} loading={statsLoading} sub={`${analytics?.messages_today ?? 0} today`} />
          <StatCard label="Monthly Revenue"    value={analytics?.monthly_revenue != null ? `₹${analytics.monthly_revenue.toLocaleString('en-IN')}` : '₹0'} color={C.green} loading={statsLoading} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit border border-white/8">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {tab === 'analytics'  && <AnalyticsTab />}
        {tab === 'workspaces' && <WorkspacesTab />}
        {tab === 'system'     && <SystemHealthTab />}
      </div>
    </div>
  );
}
