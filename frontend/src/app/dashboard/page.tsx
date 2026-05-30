'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  MessageSquare, Zap, Users, TrendingUp,
  ArrowUpRight, ArrowDownRight, Minus,
  Activity, Clock, UserPlus, Megaphone,
} from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getWorkspaceAnalytics } from '@/lib/api';
import { useAccent } from '@/app/providers';

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/8 ${className ?? ''}`} />;
}

function StatCard({
  title, value, pct, icon, color,
}: {
  title: string;
  value: number | string;
  pct?: number;
  icon: React.ReactNode;
  color: string;
}) {
  const up   = pct !== undefined && pct > 0;
  const down = pct !== undefined && pct < 0;
  return (
    <div className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--wb-text-3)' }}>{title}</p>
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--wb-text)' }}>{value}</p>
      {pct !== undefined && (
        <div className="flex items-center gap-1 text-xs">
          {up   && <ArrowUpRight  className="h-3.5 w-3.5 text-green-400" />}
          {down && <ArrowDownRight className="h-3.5 w-3.5 text-red-400"   />}
          {!up && !down && <Minus className="h-3 w-3" style={{ color: 'var(--wb-text-3)' }} />}
          <span style={{ color: up ? '#4ade80' : down ? '#f87171' : 'var(--wb-text-3)' }}>
            {up ? '+' : ''}{pct}% vs last month
          </span>
        </div>
      )}
    </div>
  );
}

const TOOLTIP_STYLE = {
  contentStyle: { background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)', borderRadius: 8 },
  labelStyle:   { color: 'var(--wb-text-3)', fontSize: 11 },
  itemStyle:    { color: 'var(--wb-text)',   fontSize: 12 },
};

// ── Page ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const { accentHex } = useAccent();

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', activeWorkspace?.id],
    queryFn: () => getWorkspaceAnalytics(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 60_000,
  });

  const stats          = data?.stats;
  const overTime       = data?.messages_over_time ?? [];
  const topFlows       = data?.top_flows          ?? [];
  const peakHours      = data?.peak_hours         ?? [];
  const recentActivity = data?.recent_activity    ?? [];

  const hasOverTime  = overTime.some((d: { count: number }) => d.count > 0);
  const hasFlows     = topFlows.length > 0;
  const hasPeak      = peakHours.some((d: { count: number }) => d.count > 0);

  // X-axis labels: show every 5th day
  const overTimeDisplay = overTime.map((d: { date: string; count: number }, i: number) => ({
    ...d,
    label: i % 5 === 0 ? d.date : '',
  }));

  return (
    <AppShell>
      <div className="p-6 max-w-6xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--wb-text)' }}>Analytics</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--wb-text-3)' }}>
              {activeWorkspace?.name ?? 'Overview'} · this month
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/contacts">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />Add Contact
              </Button>
            </Link>
            <Link href="/broadcasts">
              <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                <Megaphone className="h-3.5 w-3.5 mr-1.5" />Broadcast
              </Button>
            </Link>
          </div>
        </div>

        {/* No workspace */}
        {!activeWorkspace && !isLoading && (
          <div className="rounded-xl border border-dashed p-12 text-center"
            style={{ borderColor: 'var(--wb-border)' }}>
            <Zap className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--wb-text-3)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--wb-text-3)' }}>
              No workspace yet — set one up to see your analytics.
            </p>
            <Link href="/settings">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">Go to Settings</Button>
            </Link>
          </div>
        )}

        {activeWorkspace && (
          <>
            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
              ) : (
                <>
                  <StatCard
                    title="Messages" value={stats?.messages_this_month ?? 0}
                    pct={stats?.messages_pct}
                    icon={<MessageSquare className="h-4 w-4 text-blue-400" />}
                    color="bg-blue-500/15"
                  />
                  <StatCard
                    title="Auto Replies" value={stats?.auto_replies_this_month ?? 0}
                    pct={stats?.auto_replies_pct}
                    icon={<Zap className="h-4 w-4 text-yellow-400" />}
                    color="bg-yellow-500/15"
                  />
                  <StatCard
                    title="Active Contacts" value={stats?.active_contacts ?? 0}
                    icon={<Users className="h-4 w-4 text-purple-400" />}
                    color="bg-purple-500/15"
                  />
                  <StatCard
                    title="Flows Triggered" value={stats?.flows_triggered ?? 0}
                    pct={stats?.flows_triggered_pct}
                    icon={<TrendingUp className="h-4 w-4 text-green-400" />}
                    color="bg-green-500/15"
                  />
                </>
              )}
            </div>

            {/* ── Messages over time ── */}
            <div className="rounded-xl p-5 mb-4"
              style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--wb-text)' }}>
                  <Activity className="h-4 w-4 inline mr-1.5 opacity-60" />
                  Messages Over Time — Last 30 Days
                </h2>
              </div>
              {isLoading ? (
                <Skeleton className="h-52" />
              ) : !hasOverTime ? (
                <div className="h-52 flex flex-col items-center justify-center gap-2">
                  <MessageSquare className="h-8 w-8 opacity-20" style={{ color: 'var(--wb-text-3)' }} />
                  <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>No messages yet</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={208}>
                  <AreaChart data={overTimeDisplay} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={accentHex} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={accentHex} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--wb-border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--wb-text-3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--wb-text-3)' }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, 'Messages']} />
                    <Area type="monotone" dataKey="count" stroke={accentHex} strokeWidth={2}
                      fill="url(#msgGrad)" name="Messages" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Top Flows + Peak Hours ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              {/* Top Flows */}
              <div className="rounded-xl p-5"
                style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--wb-text)' }}>
                  <TrendingUp className="h-4 w-4 inline mr-1.5 opacity-60" />
                  Top Flows — Last 30 Days
                </h2>
                {isLoading ? (
                  <Skeleton className="h-44" />
                ) : !hasFlows ? (
                  <div className="h-44 flex flex-col items-center justify-center gap-2">
                    <Zap className="h-7 w-7 opacity-20" style={{ color: 'var(--wb-text-3)' }} />
                    <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>No flows triggered yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={176}>
                    <BarChart data={topFlows} layout="vertical" margin={{ left: 4, right: 16, top: 2, bottom: 2 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--wb-text-3)' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={90}
                        tick={{ fontSize: 10, fill: 'var(--wb-text-3)' }} axisLine={false} tickLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, 'Runs']} />
                      <Bar dataKey="count" fill={accentHex} radius={[0, 4, 4, 0]} name="Runs" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Peak Hours */}
              <div className="rounded-xl p-5"
                style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--wb-text)' }}>
                  <Clock className="h-4 w-4 inline mr-1.5 opacity-60" />
                  Peak Hours — Last 30 Days
                </h2>
                {isLoading ? (
                  <Skeleton className="h-44" />
                ) : !hasPeak ? (
                  <div className="h-44 flex flex-col items-center justify-center gap-2">
                    <Clock className="h-7 w-7 opacity-20" style={{ color: 'var(--wb-text-3)' }} />
                    <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>No data yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={176}>
                    <BarChart
                      data={peakHours.filter((_: unknown, i: number) => i % 2 === 0).map(
                        (d: { hour: number; count: number }) => ({ ...d, label: `${d.hour}h` })
                      )}
                      margin={{ left: -16, right: 4, top: 2, bottom: 2 }}
                    >
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--wb-text-3)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--wb-text-3)' }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, 'Messages']} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Messages" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Recent Activity ── */}
            <div className="rounded-xl p-5"
              style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
              <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--wb-text)' }}>
                <MessageSquare className="h-4 w-4 inline mr-1.5 opacity-60" />
                Recent Inbound Messages
              </h2>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : recentActivity.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: 'var(--wb-text-3)' }}>
                  No messages received yet
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--wb-border)' }}>
                  {recentActivity.map((item: {
                    contact_name: string; contact_phone: string;
                    body: string; created_at: string;
                  }, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                        style={{ background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }}>
                        {(item.contact_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--wb-text)' }}>
                          {item.contact_name || item.contact_phone}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--wb-text-3)' }}>
                          {item.body || '(media)'}
                        </p>
                      </div>
                      <p className="text-xs shrink-0" style={{ color: 'var(--wb-text-3)' }}>
                        {relativeTime(item.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
