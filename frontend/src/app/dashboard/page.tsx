'use client';

import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, MessageSquare, Zap, Megaphone, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getWorkspaceStats } from '@/lib/api';
import { getBusinessConfig } from '@/lib/businessConfig';

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5 animate-pulse">
      <div className="h-3 bg-white/10 rounded w-24 mb-3" />
      <div className="h-8 bg-white/10 rounded w-16" />
    </div>
  );
}

function StatCard({ title, value, emoji, accent }: { title: string; value: string | number; emoji: string; accent: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5 flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${accent} text-xl`}>{emoji}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const businessConfig = getBusinessConfig(activeWorkspace?.business_type);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', activeWorkspace?.id],
    queryFn: () => getWorkspaceStats(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 60_000,
  });

  const chartData: { day: string; inbound: number; outbound: number }[] = stats?.messages_7d ?? [];
  const hasChartData = chartData.some((d) => d.inbound > 0 || d.outbound > 0);

  return (
    <AppShell>
      <div className="p-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              {activeWorkspace?.business_type && (
                <span className="text-xl">{businessConfig.emoji}</span>
              )}
              <h1 className="text-xl font-bold text-white">
                {activeWorkspace?.onboarding_completed ? businessConfig.dashboardLabel : 'Dashboard'}
              </h1>
            </div>
            <p className="text-sm text-white/40 mt-0.5">{activeWorkspace?.name ?? 'Overview'}</p>
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

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard title="Total Contacts" value={stats?.total_contacts ?? 0} emoji="👥" accent="bg-blue-500/15" />
              <StatCard title="Messages Today" value={stats?.messages_today ?? 0} emoji="💬" accent="bg-purple-500/15" />
              <StatCard title="Active Flows" value={stats?.active_flows ?? 0} emoji="🤖" accent="bg-orange-500/15" />
              <StatCard title="AI Replies Today" value={stats?.ai_replies_today ?? 0} emoji="✨" accent="bg-green-500/15" />
            </>
          )}
        </div>

        {/* Chart — full width */}
        <div className="rounded-xl bg-white/5 border border-white/8 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white/80">Messages — Last 7 Days</h2>
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-400 inline-block" />Inbound</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400 inline-block" />Outbound</span>
            </div>
          </div>
          {isLoading ? (
            <div className="h-52 animate-pulse rounded-lg bg-white/5" />
          ) : !hasChartData ? (
            <div className="h-52 flex flex-col items-center justify-center text-white/20">
              <MessageSquare className="h-8 w-8 mb-2" />
              <p className="text-sm">No messages yet — connect WhatsApp to get started</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <AreaChart data={chartData}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={{ background: '#242424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} />
                <Area type="monotone" dataKey="inbound" stackId="1" stroke="#FF0436" fill="rgba(255,4,54,0.12)" name="Inbound" />
                <Area type="monotone" dataKey="outbound" stackId="1" stroke="#3b82f6" fill="rgba(59,130,246,0.12)" name="Outbound" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Empty state */}
        {!activeWorkspace && !isLoading && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <Zap className="h-10 w-10 mx-auto mb-3 text-white/10" />
            <p className="text-white/40 text-sm mb-4">No workspace yet. Set one up to see your stats.</p>
            <Link href="/settings">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">Go to Settings</Button>
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
