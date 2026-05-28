'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useWorkspaceStore } from '@/lib/store';
import { getRoomBills, updateRoomBill } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { toast } from 'sonner';

interface RoomBill {
  id: string;
  room_id: string;
  item_name: string;
  amount: number;
  quantity: number;
  status: 'pending' | 'paid';
  ordered_at: string;
  hotel_rooms: { room_number: string } | null;
}

type Filter = 'pending' | 'all';

export default function RoomServicePage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('pending');

  const { data: orders = [], isLoading } = useQuery<RoomBill[]>({
    queryKey: ['room-bills', activeWorkspace?.id, filter],
    queryFn: () => getRoomBills(activeWorkspace!.id, filter === 'pending' ? 'pending' : undefined),
    enabled: !!activeWorkspace,
    refetchInterval: 10_000,
  });

  const markDone = useMutation({
    mutationFn: (billId: string) => updateRoomBill(activeWorkspace!.id, billId, { status: 'paid' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-bills', activeWorkspace?.id] });
      toast.success('Order marked as done');
    },
    onError: () => toast.error('Failed to update'),
  });

  const pending = orders.filter((o) => o.status === 'pending');
  const totalRevenue = orders.reduce((s, o) => s + o.amount * o.quantity, 0);

  return (
    <AppShell>
      <div className="p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Room Service Orders</h1>
          <p className="text-sm text-white/40 mt-0.5">{activeWorkspace?.name ?? ''} — orders from WhatsApp</p>
        </div>

        {!activeWorkspace && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-white/40 text-sm">Select a workspace to view orders.</p>
          </div>
        )}

        {activeWorkspace && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl bg-white/5 border border-white/8 p-4">
                <p className="text-xs text-white/40 mb-1">Pending</p>
                <p className="text-2xl font-bold text-yellow-400">{pending.length}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/8 p-4">
                <p className="text-xs text-white/40 mb-1">Total Orders</p>
                <p className="text-2xl font-bold text-white">{orders.length}</p>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/8 p-4">
                <p className="text-xs text-white/40 mb-1">Revenue</p>
                <p className="text-2xl font-bold text-green-400">₹{totalRevenue.toFixed(2)}</p>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-1 mb-5 bg-white/5 rounded-xl p-1 w-fit border border-white/8">
              {(['pending', 'all'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${filter === f ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                >
                  {f === 'pending' ? '🟡 Pending' : '📋 All Orders'}
                </button>
              ))}
            </div>

            {/* Orders table */}
            {isLoading ? (
              <div className="rounded-xl bg-white/5 border border-white/8 p-8 text-center text-white/30 text-sm animate-pulse">
                Loading orders…
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
                <p className="text-4xl mb-3">🛎️</p>
                <p className="text-white/40 text-sm">
                  {filter === 'pending' ? 'No pending orders — all caught up!' : 'No orders yet. Orders come in via WhatsApp.'}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/3">
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Room</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Item / Request</th>
                      <th className="text-center text-xs text-white/40 font-medium px-4 py-3">Qty</th>
                      <th className="text-right text-xs text-white/40 font-medium px-4 py-3">Amount</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Time</th>
                      <th className="text-center text-xs text-white/40 font-medium px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, i) => (
                      <tr key={order.id} className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? '' : 'bg-white/2'}`}>
                        <td className="px-4 py-3 font-semibold text-white">
                          {order.hotel_rooms?.room_number ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-white/80 max-w-[200px] truncate">{order.item_name}</td>
                        <td className="px-4 py-3 text-center text-white/60">{order.quantity}</td>
                        <td className="px-4 py-3 text-right text-white/60">
                          {order.amount > 0 ? `₹${(order.amount * order.quantity).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-white/40 text-xs">{timeAgo(order.ordered_at)}</td>
                        <td className="px-4 py-3 text-center">
                          {order.status === 'pending' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">Pending</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">Done</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {order.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => markDone.mutate(order.id)}
                              disabled={markDone.isPending}
                              className="bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 h-7 text-xs px-2"
                            >
                              <Check className="h-3 w-3 mr-1" />Mark Done
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
