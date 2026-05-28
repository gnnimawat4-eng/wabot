'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { useWorkspaceStore } from '@/lib/store';
import { getHotelRooms } from '@/lib/api';

interface HotelRoom {
  id: string;
  room_number: string;
  status: 'vacant' | 'occupied';
  guest_name: string | null;
  guest_phone: string | null;
  check_in_time: string | null;
  expected_checkout: string | null;
  running_total: number;
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ room }: { room: HotelRoom }) {
  const today = new Date().toISOString().split('T')[0];
  const isDue = room.status === 'occupied' && room.expected_checkout && room.expected_checkout < today;
  if (room.status === 'vacant') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">Vacant</span>;
  }
  if (isDue) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">Due Checkout ⚠️</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">Occupied</span>;
}

export default function BookingsPage() {
  const { activeWorkspace } = useWorkspaceStore();

  const { data: rooms = [], isLoading } = useQuery<HotelRoom[]>({
    queryKey: ['hotel-rooms', activeWorkspace?.id],
    queryFn: () => getHotelRooms(activeWorkspace!.id),
    enabled: !!activeWorkspace,
    refetchInterval: 30_000,
  });

  const occupied = rooms.filter((r) => r.status === 'occupied').length;
  const vacant = rooms.filter((r) => r.status === 'vacant').length;
  const today = new Date().toISOString().split('T')[0];
  const dueCheckout = rooms.filter(
    (r) => r.status === 'occupied' && r.expected_checkout && r.expected_checkout < today
  ).length;
  const revenue = rooms.reduce((s, r) => s + (r.running_total || 0), 0);

  return (
    <AppShell>
      <div className="p-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Bookings</h1>
          <p className="text-sm text-white/40 mt-0.5">{activeWorkspace?.name ?? ''}</p>
        </div>

        {!activeWorkspace && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <p className="text-white/40 text-sm">Select a workspace to view bookings.</p>
          </div>
        )}

        {activeWorkspace && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Rooms', value: rooms.length, cls: 'text-white' },
                { label: 'Occupied', value: occupied, cls: 'text-yellow-400' },
                { label: 'Vacant', value: vacant, cls: 'text-green-400' },
                { label: 'Due Checkout', value: dueCheckout, cls: 'text-red-400' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white/5 border border-white/8 p-4">
                  <p className="text-xs text-white/40 mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Revenue */}
            {revenue > 0 && (
              <div className="rounded-xl bg-green-500/5 border border-green-500/15 px-4 py-3 mb-6 flex items-center gap-3">
                <span className="text-green-400 text-sm font-medium">Running Room Revenue:</span>
                <span className="text-green-300 text-lg font-bold">₹{revenue.toFixed(2)}</span>
              </div>
            )}

            {/* Table */}
            {isLoading ? (
              <div className="rounded-xl bg-white/5 border border-white/8 p-8 text-center text-white/30 text-sm animate-pulse">
                Loading rooms…
              </div>
            ) : rooms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
                <p className="text-4xl mb-3">🏨</p>
                <p className="text-white/40 text-sm">No rooms configured yet. Add rooms in the Rooms & QR section.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/8 bg-white/3">
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Room</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Status</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Guest</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Phone</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Check-in</th>
                      <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Expected Checkout</th>
                      <th className="text-right text-xs text-white/40 font-medium px-4 py-3">Running Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room, i) => (
                      <tr
                        key={room.id}
                        className={`border-b border-white/5 last:border-0 ${i % 2 === 0 ? '' : 'bg-white/2'}`}
                      >
                        <td className="px-4 py-3 font-semibold text-white">{room.room_number}</td>
                        <td className="px-4 py-3"><StatusBadge room={room} /></td>
                        <td className="px-4 py-3 text-white/80">{room.guest_name || '—'}</td>
                        <td className="px-4 py-3 text-white/50 font-mono text-xs">{room.guest_phone || '—'}</td>
                        <td className="px-4 py-3 text-white/50">{fmt(room.check_in_time)}</td>
                        <td className="px-4 py-3 text-white/50">{fmt(room.expected_checkout)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-white">
                          {room.status === 'occupied' ? `₹${(room.running_total || 0).toFixed(2)}` : '—'}
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
