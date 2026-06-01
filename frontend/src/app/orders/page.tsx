'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useWorkspaceStore } from '@/lib/store';
import { getOrders, confirmOrder, rejectOrder, updateOrderStatus } from '@/lib/api';
import { isRestaurantWorkspace } from '@/lib/businessConfig';
import { toast } from 'sonner';
import { RefreshCw, ShoppingBag } from 'lucide-react';

type OrderStatus =
  | 'pending_payment' | 'payment_received' | 'confirmed'
  | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';

interface Order {
  id: string;
  phone_number: string;
  items: Array<{ name: string; qty?: number; price?: number }> | string;
  total_amount: number;
  status: OrderStatus;
  notes: string | null;
  upi_id: string | null;
  payment_screenshot_url: string | null;
  payment_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { name: string; phone: string } | null;
}

type TabFilter = 'all' | OrderStatus;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment:  { label: 'Pending Payment', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  payment_received: { label: 'Payment Received', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  confirmed:        { label: 'Confirmed',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  preparing:        { label: 'Preparing',          color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  out_for_delivery: { label: 'Out for Delivery',   color: '#14b8a6', bg: 'rgba(20,184,166,0.12)' },
  delivered:        { label: 'Delivered',           color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  cancelled:        { label: 'Cancelled',           color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const TABS: { id: TabFilter; label: string }[] = [
  { id: 'all',              label: 'All' },
  { id: 'pending_payment',  label: 'Pending' },
  { id: 'payment_received', label: 'Received' },
  { id: 'confirmed',        label: 'Confirmed' },
  { id: 'preparing',        label: 'Preparing' },
  { id: 'delivered',        label: 'Delivered' },
  { id: 'cancelled',        label: 'Cancelled' },
];

const STATUS_OPTIONS: OrderStatus[] = ['confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

function timeAgoShort(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatItems(items: Order['items']): string {
  if (!items) return '';
  if (typeof items === 'string') return items;
  if (Array.isArray(items)) {
    if (items.length === 0) return '—';
    return items.map((i) => {
      if (typeof i === 'string') return i;
      const qty = i.qty ? `${i.qty}×` : '';
      return `${qty}${i.name ?? i}`.trim();
    }).join(', ');
  }
  return String(items);
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function OrdersPage() {
  const { activeWorkspace } = useWorkspaceStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabFilter>('all');

  const isRestaurant = isRestaurantWorkspace(activeWorkspace?.business_type);

  const { data: orders = [], isLoading, dataUpdatedAt } = useQuery<Order[]>({
    queryKey: ['orders', activeWorkspace?.id],
    queryFn: () => getOrders(activeWorkspace!.id),
    enabled: !!activeWorkspace && isRestaurant,
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmOrder(activeWorkspace!.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders', activeWorkspace?.id] }); toast.success('Order confirmed — customer notified'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectOrder(activeWorkspace!.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders', activeWorkspace?.id] }); toast.success('Order rejected'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateOrderStatus(activeWorkspace!.id, id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders', activeWorkspace?.id] }); toast.success('Status updated'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stats from today's orders
  const todayOrders  = orders.filter((o) => isToday(o.created_at));
  const todayRevenue = todayOrders.filter((o) => o.status === 'confirmed' || o.status === 'delivered' || o.status === 'preparing' || o.status === 'out_for_delivery').reduce((s, o) => s + (o.total_amount || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending_payment').length;
  const paymentRcvd  = orders.filter((o) => o.status === 'payment_received').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;

  const filtered = tab === 'all' ? orders : orders.filter((o) => o.status === tab);

  if (!isRestaurant) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40 p-8">
          <ShoppingBag className="h-10 w-10" style={{ color: 'var(--wb-text)' }} />
          <p className="text-sm" style={{ color: 'var(--wb-text)' }}>Orders are available for restaurant and café workspaces.</p>
          <p className="text-xs" style={{ color: 'var(--wb-text-3)' }}>Change your business type in Workspace Settings.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--wb-border)' }}>
          <div>
            <h1 className="text-base font-semibold" style={{ color: 'var(--wb-text)' }}>Orders</h1>
            {dataUpdatedAt > 0 && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--wb-text-3)' }}>
                Updated {timeAgoShort(new Date(dataUpdatedAt).toISOString())}
              </p>
            )}
          </div>
          <button onClick={() => qc.invalidateQueries({ queryKey: ['orders', activeWorkspace?.id] })}
            className="p-1.5 rounded-lg transition-colors" style={{ color: 'var(--wb-text-3)' }}
            title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats */}
        <div className="px-6 py-3 grid grid-cols-4 gap-3 border-b shrink-0" style={{ borderColor: 'var(--wb-border)' }}>
          {[
            { label: "Today's Orders",   value: todayOrders.length,   color: 'var(--wb-text)' },
            { label: "Today's Revenue",  value: `₹${(todayRevenue).toLocaleString('en-IN')}`, color: '#22c55e' },
            { label: 'Pending Payment',  value: pendingCount,  color: pendingCount > 0 ? '#ef4444' : 'var(--wb-text)' },
            { label: 'Payment Received', value: paymentRcvd,  color: paymentRcvd > 0 ? '#3b82f6' : 'var(--wb-text)' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--wb-text-3)' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 pb-1 flex gap-1.5 overflow-x-auto shrink-0 border-b" style={{ borderColor: 'var(--wb-border)' }}>
          {TABS.map((t) => {
            const count = t.id === 'all' ? orders.length : orders.filter((o) => o.status === t.id).length;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg mb-2 transition-colors flex items-center gap-1.5"
                style={tab === t.id
                  ? { background: 'var(--wb-bg-active)', color: 'var(--wb-accent)' }
                  : { background: 'var(--wb-bg-hover)', color: 'var(--wb-text-3)' }}>
                {t.label}
                {count > 0 && (
                  <span className="text-[10px] px-1.5 rounded-full font-semibold"
                    style={tab === t.id ? { background: 'var(--wb-accent)', color: '#fff' } : { background: 'var(--wb-border)', color: 'var(--wb-text-2)' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Order cards */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--wb-bg-hover)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-40">
              <ShoppingBag className="h-8 w-8" style={{ color: 'var(--wb-text)' }} />
              <p className="text-sm" style={{ color: 'var(--wb-text-3)' }}>No orders{tab !== 'all' ? ` with status "${tab.replace(/_/g, ' ')}"` : ''}</p>
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              {filtered.map((order) => {
                const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending_payment;
                const customerName = order.contacts?.name || order.phone_number;
                const isPaymentReceived = order.status === 'payment_received';
                const canUpdateStatus = ['confirmed', 'preparing', 'out_for_delivery'].includes(order.status);

                return (
                  <div key={order.id} className="rounded-xl p-4" style={{ background: 'var(--wb-bg-card)', border: '1px solid var(--wb-border)' }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded" style={{ background: 'var(--wb-bg-hover)', color: 'var(--wb-text-2)' }}>
                          #{order.id.slice(-6).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--wb-text)' }}>{customerName}</p>
                          <p className="text-xs" style={{ color: 'var(--wb-text-3)' }}>{order.phone_number} · {timeAgoShort(order.created_at)}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0 whitespace-nowrap"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs mb-0.5" style={{ color: 'var(--wb-text-3)' }}>Items</p>
                        <p className="text-sm truncate max-w-xs" style={{ color: 'var(--wb-text)' }}>
                          {formatItems(order.items)}
                        </p>
                        {order.notes && (
                          <p className="text-xs mt-1 italic" style={{ color: 'var(--wb-text-3)' }}>{order.notes}</p>
                        )}
                      </div>
                      <p className="text-lg font-bold shrink-0" style={{ color: '#22c55e' }}>
                        ₹{(order.total_amount ?? 0).toLocaleString('en-IN')}
                      </p>
                    </div>

                    {/* Action buttons */}
                    {isPaymentReceived && (
                      <div className="flex gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'var(--wb-border)' }}>
                        <button
                          onClick={() => confirmMut.mutate(order.id)}
                          disabled={confirmMut.isPending}
                          className="flex-1 py-2 text-sm font-semibold rounded-xl text-white transition-opacity disabled:opacity-40"
                          style={{ background: '#16a34a' }}>
                          ✅ Confirm Payment
                        </button>
                        <button
                          onClick={() => rejectMut.mutate(order.id)}
                          disabled={rejectMut.isPending}
                          className="flex-1 py-2 text-sm font-semibold rounded-xl transition-opacity disabled:opacity-40"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                          ❌ Reject
                        </button>
                      </div>
                    )}

                    {canUpdateStatus && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--wb-border)' }}>
                        <select
                          value={order.status}
                          onChange={(e) => statusMut.mutate({ id: order.id, status: e.target.value })}
                          className="w-full text-xs rounded-lg px-3 py-2 focus:outline-none"
                          style={{ background: 'var(--wb-input)', border: '1px solid var(--wb-border)', color: 'var(--wb-text)' }}>
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* UPI not configured warning */}
          {!activeWorkspace?.upi_id && orders.length > 0 && (
            <div className="mt-4 max-w-2xl rounded-xl px-4 py-3 text-xs"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
              ⚠ UPI ID not configured. Go to Settings → WhatsApp Connection → UPI Payment Settings.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
