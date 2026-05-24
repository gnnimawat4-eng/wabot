'use client';

import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, MessageSquare, Workflow, TrendingUp } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useWorkspaceStore } from '@/lib/store';
import { getWorkspaceStats } from '@/lib/api';

function StatCard({
  title, value, icon: Icon, accent,
}: {
  title: string; value: string | number; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/8 p-5 flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${accent}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspaceStore();

  const { data: stats } = useQuery({
    queryKey: ['stats', activeWorkspace?.id],
    queryFn: () => getWorkspaceStats(activeWorkspace!.id),
    enabled: !!activeWorkspace,
  });

  const chartData = stats?.messages_7d ?? [];

  return (
    <AppShell>
      <div className="p-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {activeWorkspace?.name ?? 'Overview'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Contacts" value={stats?.total_contacts ?? 0} icon={Users} accent="bg-blue-500/20" />
          <StatCard title="New Today" value={stats?.new_contacts_today ?? 0} icon={TrendingUp} accent="bg-green-500/20" />
          <StatCard title="Messages Today" value={stats?.messages_today ?? 0} icon={MessageSquare} accent="bg-purple-500/20" />
          <StatCard title="Active Flows" value={stats?.active_flows ?? 0} icon={Workflow} accent="bg-orange-500/20" />
        </div>

        <div className="rounded-xl bg-white/5 border border-white/8 p-5 mb-4">
          <h2 className="text-sm font-semibold text-white/80 mb-4">Messages — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
              />
              <Area type="monotone" dataKey="inbound" stackId="1" stroke="#22c55e" fill="rgba(34,197,94,0.15)" name="Inbound" />
              <Area type="monotone" dataKey="outbound" stackId="1" stroke="#3b82f6" fill="rgba(59,130,246,0.15)" name="Outbound" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {stats?.stage_counts && (
          <div className="rounded-xl bg-white/5 border border-white/8 p-5">
            <h2 className="text-sm font-semibold text-white/80 mb-4">Pipeline Stages</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.stage_counts as Record<string, number>).map(([stage, count]) => (
                <div key={stage} className="flex flex-col items-center bg-white/5 rounded-lg p-4 min-w-[80px]">
                  <span className="text-2xl font-bold text-white">{count}</span>
                  <span className="text-xs text-white/40 capitalize mt-1">{stage.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
